'use strict'

const assert = require('node:assert')

/**
 * Mock action that calls Cardtrader wishlist API and logs the response.
 *
 * @param {InputAction} options
 * @returns {Promise<OutputAction>}
**/
async function inspectCardtrader (options) {
  const baseUrl = 'https://api.cardtrader.com/api/v2' // ! todo

  const url = `${baseUrl}/expansions`
  const { body } = await debug(url, options)
  const finalFantasy = body.filter(e => e.name.toLowerCase().includes('final fantasy'))

  // I should get all the cards in the expansion
  const singleExpansion = finalFantasy[2]
  const urlSet = `${baseUrl}/blueprints/export?expansion_id=${singleExpansion.id}`
  const { body: cardsSet } = await debug(urlSet, options)

  const urlWish = `${baseUrl}/wishlists/${options.wishlistId}`
  const { body: wishlist } = await debug(urlWish, options)

  const productWishlist = wishlist.items.map(wishItem => {
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

    return cardsSet.find(card => {
      return singleExpansion.code === wishItem.expansion_code &&
        card.fixed_properties?.collector_number === wishItem.collector_number
    })
  })

  console.log(JSON.stringify(productWishlist, null, 2))

  const singleCard = productWishlist.find(card => card !== null)
  const productUrl = `${baseUrl}/marketplace/products?expansion_id=${singleCard.expansion_id}&blueprint_id=${singleCard.id}`
  const { body: productInfo } = await debug(productUrl, options)

  console.log('Product info for single card:')
  console.log(JSON.stringify(productInfo, null, 2))
}

async function debug (url, options) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
  })

  const body = await response.json()

  // Mock behavior: just print everything we got back
  console.log('Cardtrader wishlist response:')
  console.log(JSON.stringify({
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  }, null, 2))

  require('fs').writeFileSync(`./${Date.now()}.json`, JSON.stringify(body, null, 2))

  return { statusCode: response.status, body }
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
