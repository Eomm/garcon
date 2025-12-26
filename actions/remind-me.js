'use strict'

const assert = require('node:assert')
const { generateObject } = require('ai')
const { openai } = require('@ai-sdk/openai')
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible')
const { z } = require('zod')

const notifyUser = require('./telegram-notification')

/**
 * @param {InputAction} options
 * @returns {Promise<OutputAction[]>}
**/
async function remindMe (options) {
  const prompt = `You are a smart assistant that helps me reminding different things.
I'm forwarding you a message that I received from different sources.
The message always includes something that I must remember.
It could include multiple things to remember.
The message may be in italian or english, but you must always reply in english.
The message may not include all the information you need.
The dates are relative to today's date: ${new Date().toISOString().slice(0, 10)}.
Use the YYYY-MM-DD format as output.
You can use the web search preview tool to find the platform where a media is available in ITALY.
You can use the web search preview tool to find the genre of a media.
For each output field, read the message and try to extract the information from it.
Do not try to fullfill all the information if you can't find it.
You must extract the information from the following message:

---Message section:---
${options.parseMessage}`

  // Deeps
  // https://hix.ai/home

  const lmstudio = createOpenAICompatible({
    name: 'lmstudio',
    baseURL: 'http://localhost:1234/v1',
  })

  const res = await generateObject({
    prompt,
    // model: openai('o3-mini'), // 😄
    // model: lmstudio('deepseek-r1-distill-qwen-7b'), // 🤮
    // model: lmstudio('gemma-3-4b-it'), // 😕
    model: lmstudio('deepseek-r1-distill-llama-8b'), // 🥲
    maxRetries: 2,
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

  // TODO if debug
  require('fs').writeFileSync(`./${res.response.id}.json`, JSON.stringify(res, null, 2))

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
    parseMessage: telegramMsg.message.caption || telegramMsg.message.text,
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

  // TODO define a better output (such as setting a ✅ reaction)
  await notifyUser.action(options, result.map((result) =>
    ({ type: 'message', payload: `Saved ${result.title} ✅` })
  ))
}

module.exports = {
  commandName: 'remind-me',
  canHandle: (telegramMsg) => {
    const isChannelForwardedMsg = //
      telegramMsg.message.forward_origin.type === 'channel' &&
      telegramMsg.message.forward_from_chat.type === 'channel' &&
      telegramMsg.message.caption

    const isUserForwardedMsg = //
      telegramMsg.message.forward_origin.type === 'user' &&
      telegramMsg.message.text

    return isChannelForwardedMsg || isUserForwardedMsg
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
