'use strict'

const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const { createClient } = require('@supabase/supabase-js')

const notifyUser = require('./telegram-notification')

const CARD_TRADER_BASE_URL = 'https://api.cardtrader.com/api/v2'

async function loadDbCards (supabase) {
  const { data, error } = await supabase
    .from('tracking_card')
    .select('*')
    .order('price_cent', { ascending: true })

  if (error) {
    console.error('Error loading tracking_card from Supabase', error)
    return []
  }

  return data ?? []
}

async function upsertTrackingCards (supabase, rows) {
  if (!rows || rows.length === 0) {
    console.log('No tracking_card rows to upsert')
    return
  }

  const { error } = await supabase
    .from('tracking_card')
    .upsert(rows, { onConflict: 'blueprint_id' })

  if (error) {
    console.error('Error upserting tracking_card into Supabase', error)
  } else {
    console.log(`Upserted ${rows.length} tracking_card rows into Supabase`)
  }
}

async function loadExpansionsMap (options) {
  const url = `${CARD_TRADER_BASE_URL}/expansions`
  const body = await cacheRequest(url, options)

  // The body is an array of expansions, e.g.:
  // {
  //   "id": 3,
  //   "game_id": 1,
  //   "code": "pgrn",
  //   "name": "Guilds of Ravnica Promos"
  // },

  // Transform the array into a Map for easier access:
  return new Map(body.map(expansion => [expansion.code, expansion]))
}

async function fetchWishlist (options) {
  const urlWish = `${CARD_TRADER_BASE_URL}/wishlists/${options.wishlistId}`
  const wishlist = await freshRequest(urlWish, options)

  // The body contains the wishlist details, including items, e.g.:
  // {
  //   "quantity": 1,
  //   "meta_name": "cid-timeless-artificer",
  //   "expansion_code": "cfin",
  //   "collector_number": "416",
  //   "language": "en",
  //   "condition": "Near Mint",
  //   "foil": "",
  //   "reverse": ""
  // },

  return wishlist.items
}

async function fetchCardSetMap (expansionId, options) {
  const urlSet = `${CARD_TRADER_BASE_URL}/blueprints/export?expansion_id=${expansionId}`
  const cardsSet = await cacheRequest(urlSet, options)
  const collectionMap = new Map()
  for (const card of cardsSet) {
    const cardNumber = card.fixed_properties?.collector_number
    if (cardNumber) {
      collectionMap.set(cardNumber, card)
    }
  }
  return collectionMap
}

async function fetchCardProducts (completeCard, options) {
  const { cardWish, cardDetail } = completeCard
  const blueprintId = cardDetail.id
  const language = cardWish.language || 'en'
  const productUrl = `${CARD_TRADER_BASE_URL}/marketplace/products?blueprint_id=${blueprintId}
  &language=${language}`
  const productInfo = await freshRequest(productUrl, options)
  // const productInfo = await cacheRequest(productUrl, options)

  if (!productInfo[blueprintId]) {
    // No offers found for this card
    return []
  }

  const offers = productInfo[blueprintId].filter(buyItem => {
    // Condition not set or matches the wishlist
    const conditionMatch = !cardWish.condition || buyItem.properties_hash.condition === cardWish.condition
    const languageMatch = buyItem.properties_hash.mtg_language === language
    const isCardTraderZero = buyItem.user.can_sell_sealed_with_ct_zero === true ||
      buyItem.user.user_type === 'pro' ||
      buyItem.user.can_sell_via_hub === true

    return conditionMatch && languageMatch && isCardTraderZero
  })

  return offers
}

/**
 * Process items in batches with rate limiting to avoid API limits
 * @param {Array} items - Array of items to process
 * @param {Function} processFn - Async function to process each item
 * @param {Object} options - Rate limiting options
 * @param {number} options.batchSize - Number of requests per batch (default: 8)
 * @param {number} options.delayMs - Delay between batches in milliseconds (default: 1000)
 * @returns {Promise<Array>} Array of results
 */
async function processBatchesWithRateLimit (items, processFn, { batchSize = 8, delayMs = 1000 } = {}) {
  const results = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    const batchResults = await Promise.all(batch.map(processFn))
    results.push(...batchResults)

    // Wait before processing next batch (unless this is the last batch)
    if (i + batchSize < items.length) {
      console.log(`Processed ${i + batch.length} items, waiting ${delayMs}ms before next batch...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}

/**
 * Mock action that calls Cardtrader wishlist API and logs the response.
 *
 * @param {InputAction} options
 * @returns {Promise<Array<{ card: any, prices: any[] }>>}
**/
async function inspectCardtrader (options) {
  const supabase = createClient(options.supabaseUrl, options.supabaseKey)
  const dbCards = await loadDbCards(supabase)

  const expansionsMap = await loadExpansionsMap(options)
  const wishListItems = await fetchWishlist(options)

  // Get the list of expansion IDs included in the wishlist to optimize requests
  const includedExpansionIds = new Set()
  for (const wishItem of wishListItems) {
    const expansion = expansionsMap.get(wishItem.expansion_code)
    includedExpansionIds.add(expansion.id)
  }

  // For each expansion in the wishlist, I need to get all the cards of that expansion
  const cardSetMap = new Map()
  for (const expansionId of includedExpansionIds) {
    const collectionMap = await fetchCardSetMap(expansionId, options)
    cardSetMap.set(expansionId, collectionMap)
  }

  // I should get all the cards in the expansion
  const productWishlist = wishListItems.map(wishItem => {
    const cardExpansion = expansionsMap.get(wishItem.expansion_code)
    const cardSet = cardSetMap.get(cardExpansion.id)
    const cardDetail = cardSet.get(wishItem.collector_number)

    if (!cardDetail) {
      console.warn(`Card not found: Expansion ${wishItem.expansion_code} (${cardExpansion.id}), Collector Number ${wishItem.collector_number}`)
      return null
    }

    return { cardWish: wishItem, cardDetail }
  })

  // For each card in the wishlist, fetch product info with rate limiting
  const validCards = productWishlist.filter(card => card !== null)

  const toBuy = await processBatchesWithRateLimit(
    validCards,
    async (card) => {
      const prices = await fetchCardProducts(card, options)
      return { card, prices }
    },
    { batchSize: 8, delayMs: 1000 }
  )

  // Print result in a table
  const tableView = toBuy.map(entry => {
    const { card, prices } = entry
    const { cardWish, cardDetail } = card
    return {
      id: cardDetail.id,
      name: cardDetail.name,
      expansion: cardWish.expansion_code,
      collector_number: cardWish.collector_number,
      condition: cardWish.condition,
      lowestPrice: prices?.[0]?.price.formatted || 'N/A',
      link: `https://www.cardtrader.com/it/cards/${cardDetail.id}`
    }
  }).sort((a, b) => a.id - b.id)

  console.table(tableView)

  const rows = toBuy
    .filter(toBuyEntry => toBuyEntry.prices?.length > 0)
    .map(entry => {
      const { card, prices } = entry
      const { cardWish, cardDetail } = card
      const lowestPrice = prices[0].price.cents

      return {
        blueprint_id: cardDetail.id,
        name: cardDetail.name,
        expansion: cardWish.expansion_code,
        price_cent: lowestPrice,
      }
    })

  await upsertTrackingCards(supabase, rows)

  const notifications = []
  for (const dbCard of dbCards) {
    const currentValue = toBuy.find(entry => entry.card.cardDetail.id === dbCard.blueprint_id)
    if (!currentValue) {
      // This is a new card that was not tracked before
      continue
    }

    const currentPrice = currentValue.prices?.[0]?.price.cents || null
    if (currentPrice && currentPrice < dbCard.price_cent) {
      notifications.push({
        blueprint_id: dbCard.blueprint_id,
        name: dbCard.name,
        old_price_cent: dbCard.price_cent,
        new_price_cent: currentPrice,
      })
    }
  }

  return notifications
}

async function freshRequest (url, options) {
  return cacheRequest(url, options, false)
}

async function cacheRequest (url, options, useCache = true) {
  const filename = urlToFilename(url)

  const cacheFile = path.join(__dirname, '..', 'cache', filename)
  if (useCache && fs.existsSync(cacheFile)) {
    console.log(`Reading from cache ${cacheFile}`)
    const cachedContent = fs.readFileSync(cacheFile, 'utf-8')
    return JSON.parse(cachedContent)
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
  })

  const body = await response.json()

  // Save to cache
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify(body, null, 2))

  return body
}

function urlToFilename (url) {
  const encoded = encodeURIComponent(url)
  return encoded.replace(/[^a-zA-Z0-9]/g, '_')
}

/**
 * @param {import('telegraf').Telegraf} telegramMsg
 * @param {import('node:process').Env} env
 * @returns {InputAction}
 */
function buildOptions (telegramMsg, env) {
  assert.ok(env.CARDTRADER_API_KEY, 'CARDTRADER_API_KEY is required')
  assert.ok(env.CARDTRADER_WISHLIST_ID, 'CARDTRADER_WISHLIST_ID is required')
  assert.ok(env.SUPABASE_URL, 'SUPABASE_URL is required')
  assert.ok(env.SUPABASE_API_KEY, 'SUPABASE_API_KEY is required')
  assert.ok(env.TELEGRAM_CHAT_ID, 'TELEGRAM_CHAT_ID is required')
  assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')

  return {
    fullMessage: telegramMsg,
    apiKey: env.CARDTRADER_API_KEY,
    wishlistId: env.CARDTRADER_WISHLIST_ID,
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_API_KEY,
    chatId: env.TELEGRAM_CHAT_ID,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    debug: env.DEBUG_INSPECT_CARDTRADER === 'true' || false,
  }
}

/**
 * @param {InputAction} options
 * @returns {Promise<NotificationPriceDrop[]>}
 */
async function executeFlow (options) {
  const outputMsgs = await inspectCardtrader(options)

  if (outputMsgs.length === 0) {
    console.log('No price drops detected, no notification sent.')
    return
  }

  const notificationMessage = outputMsgs.map((curr) => {
    return `- [${curr.name}](https://www.cardtrader.com/it/cards/${curr.blueprint_id}): da ${formatPrice(curr.old_price_cent)} a ${formatPrice(curr.new_price_cent)}`
  }).join('\n')

  await notifyUser.action(options, [
    { type: 'message', payload: notificationMessage }
  ])
}

module.exports = {
  commandName: 'inspect-cardtrader',
  canHandle: (msg) => msg.cardtrader === true,
  action: inspectCardtrader,
  buildOptions,
  executeFlow,
}

/**
 * @typedef {Object} InputAction
 * @property {import('telegraf').Telegraf} fullMessage
 * @property {string} apiKey
 * @property {string} wishlistId
 * @property {string} supabaseUrl
 * @property {string} supabaseKey
 * @property {boolean} debug
 */

/**
 * @typedef {Object} NotificationPriceDrop
 * @property {number} blueprint_id
 * @property {string} name
 * @property {number} old_price_cent
 * @property {number} new_price_cent
 */

function formatPrice (cent) {
  return `€${(cent / 100).toFixed(2)}`
}
