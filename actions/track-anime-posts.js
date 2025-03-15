'use strict'

const assert = require('node:assert')
const { generateObject } = require('ai')
const { openai } = require('@ai-sdk/openai')
const { z } = require('zod')

const notifyUser = require('./telegram-notification')

/**
 * @param {InputAction} options
 * @returns {Promise<{ title: string }>}
**/
async function trackAnimePost (options) {
  // gpt-4o-mini

  const prompt = `Extract the information from the following chat message.
The message is in italian and may not include all the information you need.
The dates are relative to today's date: ${new Date().toISOString().slice(0, 10)}.
Use the YYYY-MM-DD format for the release date.

You can use the web search preview tool to find the platform where the anime is available
in ITALY.

  ---
${options.fullMessage.message.caption}`

  const res = await generateObject({
    prompt,
    model: openai('o3-mini'),
    schema: z.object({
      type: z.string(),
      title: z.string(),
      category: z.string(),
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
      },
    },
  })

  console.log(res)

  require('fs').writeFileSync('./chatgpt.json', JSON.stringify(res, null, 2))

  // o3-mini
  // try {
  //
  // } finally {
  // }
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
  const result = await trackAnimePost(options)

  // TODO store result to a database

  await notifyUser.action(options, [
    { type: 'message', payload: `Saved ${result.title} ✅` },
    // TODO delete previous message
  ])
}

module.exports = {
  commandName: 'track-anime-posts',
  canHandle: (telegramMsg) => {
    return !telegramMsg.message.text &&
      telegramMsg.message.forward_origin.type === 'channel' &&
      telegramMsg.message.forward_from_chat.type === 'channel' &&
      telegramMsg.message.caption
  },
  action: trackAnimePost,
  buildOptions,
  executeFlow
}

/**
 * @typedef {Object} InputAction
 * @property {import('telegraf').Telegraf} fullMessage
 * @property {string} apiKey
 * @property {string} chatId
 * @property {string} telegramBotToken
 */
