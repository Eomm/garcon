'use strict'

const assert = require('node:assert')
const { generateText, Output } = require('ai')
const { openai } = require('@ai-sdk/openai')
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible')
const { z } = require('zod')

const notifyUser = require('./telegram-notification')

/**
 * @param {InputAction} options
 * @returns {Promise<OutputAction[]>}
**/
async function remindMe (options) {
  const prompt = `
You are a smart assistant that must extract reminders from forwarded messages.

## Input

You will get a forwarded message from a Telegram user.
The message always includes one or more of the following information to remember:
- a title of an interesting media
- when the media will be released
- when an event will happen
The message may include multiple media titles to remember.
The message may be in italian or english.
The dates are relative to today's date: ${new Date().toISOString().slice(0, 10)}.
The message may not include all the information you need: do not invent any information.

## Output

You must reply in english and in JSON format.
You must output a JSON array of objects where each object is a reminder to save.
Use always YYYY-MM-DD format as output. If the precise date is not known, assume the first day of the month or year.
You can use the web search preview tool to find the platform where a media is available in ITALY.
You can use the web search preview tool to find the genre of a media.
Any missing information should be left blank in the output.
For each output field, read the message and try to extract the information from it.`

  // Deeps
  // https://hix.ai/home

  const lmstudio = createOpenAICompatible({
    name: 'lmstudio',
    baseURL: 'http://localhost:1234/v1',
    supportsStructuredOutputs: true,
  })

  const res = await generateText({
    model: lmstudio('deepseek-r1-distill-llama-8b'),
    system: prompt,
    prompt: options.parseMessage,
    maxRetries: 2,
    maxSteps: 3,
    output: Output.array({
      element: z.object({
        title: z.string(),
        category: z.string(),
        genre: z.string(),
        releaseDate: z.string(),
        studio: z.string(),
        platform: z.string(),
      })
    }),
    toolChoice: 'auto',
    tools: {
      // web_search: openai.tools.webSearch(),
    },
    providerOptions: {
      openai: {
        parallelToolCalls: false,
        reasoningEffort: 'medium'
      },
    },
  })

  // console.log(res)
  console.log(res.output)
  // console.log(res.totalUsage)

  // TODO if debug
  require('fs').writeFileSync(`./NO_${res.response.id}.json`, JSON.stringify(res, null, 2))

  return res.output
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
