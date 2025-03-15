'use strict'

const assert = require('node:assert')
const { generateObject } = require('ai')
const { openai } = require('@ai-sdk/openai')
const { z } = require('zod')

const notifyUser = require('./telegram-notification')

/**
 * @param {InputAction} options
 * @returns {Promise<OutputAction[]>}
**/
async function remindMe (options) {
  const prompt = `
You are a smart assistant that helps me reminding different things.
I'm forwarding you a message that I received from different channels.
The message always includes something that I must remember.
It could include multiple things to remember.
The message may be in italian or english, but you must always reply in english.
The message may not include all the information you need.
The dates are relative to today's date: ${new Date().toISOString().slice(0, 10)}.
Use the YYYY-MM-DD format as output.
You can use the web search preview tool to find the platform where a media is available in ITALY.
You can use the web search preview tool to find the genre of a media.
You must extract the information from the following message:
  ---
${options.parseMessage}`

  const res = await generateObject({
    prompt,
    model: openai('o3-mini'),
    output: 'array',
    schema: z.object({
      title: z.string(),
      category: z.string(),
      genre: z.string(),
      releaseDate: z.string(),
      studio: z.string(),
      platform: z.string(),
    }),
    tools: {
      web_search_preview: openai.tools.webSearchPreview(),
    },
    providerOptions: {
      openai: {
        parallelToolCalls: false,
        reasoningEffort: 'medium'
      },
    },
  })

  console.log(res)
  require('fs').writeFileSync('./chatgpt.json', JSON.stringify(res, null, 2))

  return res.object
}

/**
 * @param {import('telegraf').Telegraf} telegramMsg
 * @param {import('node:process').Env} env
 * @returns {InputAction}
 */
function buildOptions (telegramMsg, env) {
  assert.ok(env.OPENAI_API_KEY, 'OPENAI_API_KEY is required')
  assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')

  return {
    fullMessage: telegramMsg,
    parseMessage: telegramMsg.message.caption,
    apiKey: env.OPENAI_API_KEY,
    chatId: String(telegramMsg.message.chat.id),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  }
}

/**
 * @param {InputAction} options
 * @returns {Promise<void>}
 */
async function executeFlow (options) {
  const result = await remindMe(options)

  // TODO store result to a database

  await notifyUser.action(options, [
    { type: 'message', payload: `Saved ${result.title} ✅` },
    // TODO delete previous message
  ])
}

module.exports = {
  commandName: 'track-anime-posts',
  canHandle: (telegramMsg) => {
    const isForwardedMessage = //
      telegramMsg.message.forward_origin.type === 'channel' &&
      telegramMsg.message.forward_from_chat.type === 'channel' &&
      telegramMsg.message.caption

    return !telegramMsg.message.text && isForwardedMessage
  },
  action: remindMe,
  buildOptions,
  executeFlow
}

/**
 * @typedef {Object} InputAction
 * @property {import('telegraf').Telegraf} fullMessage
 * @property {string} parseMessage
 * @property {string} apiKey
 * @property {string} chatId
 * @property {string} telegramBotToken
 */

/**
 * @typedef {Object} OutputAction
 * @property {string} title
 * @property {string} category
 * @property {string} genre
 * @property {string} releaseDate
 * @property {string} studio
 * @property {string} platform
 */
