'use strict'

const assert = require('node:assert')
const { Telegraf } = require('telegraf')

/**
 * @param {InputAction} options
 *
**/
async function notifyUser (options, steps) {
  const bot = new Telegraf(options.telegramBotToken)

  const chatId = options.chatId
  for (const step of steps) {
    console.log(`Sending ${step.type} to chat`)
    switch (step.type) {
      case 'message':
        await bot.telegram.sendMessage(chatId, step.payload, { parse_mode: 'Markdown' })
        break
      case 'file':
        await bot.telegram.sendDocument(chatId, { source: step.payload })
        break
      default:
        throw new Error(`Step ${step} not found`)
    }
  }
}

/**
 * @param {import('telegraf').Telegraf} telegramMsg
 * @param {InputStep[]} steps
 */
function buildOptions (telegramMsg, env) {
  assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')

  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    chatId: String(telegramMsg.message.chat.id)
  }
}

/**
 * @param {InputAction} options
 * @returns {Promise<void>}
**/
async function executeFlow (options) {
  const steps = [
    { type: 'message', payload: `The chat id is: ${options.chatId}` },
  ]

  await notifyUser(options, steps)
}

module.exports = {
  commandName: 'notify-user',
  canHandle: (telegramMsg) => telegramMsg.message.text.startsWith('/chatid'),
  action: notifyUser,
  buildOptions,
  executeFlow
}

/**
 * @typedef {Object} InputAction
 * @property {string} chatId
 * @property {string} telegramBotToken
 */

/**
 * @typedef {Object} InputStep
 * @property {string} type - The type of the document, e.g., 'message' or 'file'.
 * @property {string} payload - The payload of the document.
 */
