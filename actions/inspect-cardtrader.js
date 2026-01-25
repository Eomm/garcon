'use strict'

const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

const baseUrl = 'https://api.cardtrader.com/api/v2' // ! todo

async function loadExpansionsMap (options) {
  const url = `${baseUrl}/expansions`
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
  const urlWish = `${baseUrl}/wishlists/${options.wishlistId}`
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
  const urlSet = `${baseUrl}/blueprints/export?expansion_id=${expansionId}`
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
  const productUrl = `${baseUrl}/marketplace/products?expansion_id=${cardDetail.expansion_id}
  &blueprint_id=${blueprintId}
  &language=${cardWish.language ?? 'en'}`
  const productInfo = await freshRequest(productUrl, options)

  const offers = productInfo[blueprintId].filter(buyItem => {
    // Condition not set or matches the wishlist
    return !cardWish.condition || buyItem.properties_hash.condition === cardWish.condition
  })

  return offers
}

/**
 * Mock action that calls Cardtrader wishlist API and logs the response.
 *
 * @param {InputAction} options
 * @returns {Promise<OutputAction>}
**/
async function inspectCardtrader (options) {
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

  // For each card in the wishlist, fetch product info
  const toBuy = []
  for (const card of productWishlist) {
    if (card === null) continue
    const prices = await fetchCardProducts(card, options)
    toBuy.push({ card, prices })
  }

  // Print result in a table
  const tableView = toBuy.map(entry => {
    const { card, prices } = entry
    const { cardWish, cardDetail } = card
    return {
      name: cardDetail.name,
      expansion: cardWish.expansion_code,
      collector_number: cardWish.collector_number,
      condition: cardWish.condition,
      lowestPrice: prices?.[0]?.price.formatted || 'N/A',
      link: `https://www.cardtrader.com/it/cards/${cardDetail.id}`
    }
  })

  console.table(tableView)

  // TODO save on DB and then notify user via Telegram
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

  return {
    fullMessage: telegramMsg,
    apiKey: env.CARDTRADER_API_KEY,
    wishlistId: env.CARDTRADER_WISHLIST_ID,
    debug: env.DEBUG_INSPECT_CARDTRADER === 'true' || false,
  }
}

/**
 * @param {InputAction} options
 * @returns {Promise<void>}
 */
async function executeFlow (options) {
  await inspectCardtrader(options)
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
 * @property {boolean} debug
 */

/**
 * @typedef {Object} OutputAction
 * @property {number} statusCode
 * @property {any} body
 */
