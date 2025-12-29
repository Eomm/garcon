'use strict'

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { generateText, Output } = require('ai')
const { createGoogleGenerativeAI } = require('@ai-sdk/google')
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

You will get a forwarded message from a Telegram chat.
The message always includes one or more of the following information to remember:
- a title of an interesting media
- when the media will be released
- when an event will happen
The message may be in italian or english.
The message may include multiple media titles to remember.
The dates are relative to today's date: ${new Date().toISOString().slice(0, 10)}.

## Output

You must output a JSON array of objects where each object is a reminder to save.
You must reply in english and in JSON format.
Except for the media title, all other fields are optional and must be lowercased.
Use always YYYY-MM-DD format as output.
If the precise date is not known, assume the first day of the month or year.
You can use the web search preview tool to find the platform where a media is available in ITALY.
You can use the web search preview tool to find the genre of a media.
The user message may not include all the information you need: do not invent any information.
Any missing information should be left blank in the output.
`

  const google = createGoogleGenerativeAI({
    apiKey: options.apiKey,
  // custom settings
  })

  const res = await generateText({
    model: google('gemini-2.5-flash'),
    system: prompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: options.parseMessage },
          // {
          //   type: 'file',
          //   data: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          //   mediaType: 'video/mp4',
          // },
        ]
      }
    ],
    maxRetries: 2,
    maxSteps: 3,
    output: Output.array({
      element: z.object({
        title: z.string(),
        season: z.string(),
        category: z.enum(['movie', 'anime', 'manga', 'video game', 'event']),
        genre: z.array(z.string()),
        releaseDate: z.string(),
        studio: z.string().optional(),
        platform: z.string().optional(),
      })
    }),
    toolChoice: 'auto',
    tools: {
      // TODO: not working yet
      // google_search: google.tools.googleSearch({
      // }),
    },
    providerOptions: {
      google: {
        structuredOutputs: true,
      },
    },
  })
  console.log(`This request took ${res.totalUsage.inputTokens} input token and ${res.totalUsage.outputTokens} output tokens`)

  if (options.debug) {
    const debugFile = path.join(__dirname, '../', `./GEMINI_${res.response.id}.json`)
    fs.writeFileSync(debugFile, JSON.stringify(res, null, 2))

    console.debug(res.output)
  }

  return res.output
}

/**
 * @param {import('telegraf').Telegraf} telegramMsg
 * @param {import('node:process').Env} env
 * @returns {InputAction}
 */
function buildOptions (telegramMsg, env) {
  assert.ok(env.GOOGLE_AI_API_KEY, 'GOOGLE_AI_API_KEY is required')
  assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')

  return {
    fullMessage: telegramMsg,
    parseMessage: telegramMsg.message.caption || telegramMsg.message.text,
    apiKey: env.GOOGLE_AI_API_KEY,
    chatId: String(telegramMsg.message.chat.id),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    debug: env.DEBUG_REMIND_ME === 'true' || false,
  }
}

/**
 * @param {InputAction} options
 * @returns {Promise<void>}
 */
async function executeFlow (options) {
  const result = await remindMe(options)

  // TODO store result automatically to my reminders APP
  const outputMsgs = result.map((r) => {
    return `il ${r.releaseDate} esce ${r.title} ${r.platform ? ` su ${r.platform}` : ''}`
  })

  await notifyUser.action(options, result.map((result) =>
    ({ type: 'message', payload: `Aggiungi i seguenti promemoria:\n ${outputMsgs.join('\n')}` })
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
 * @property {boolean} debug
 */

/**
 * @typedef {Object} OutputAction
 * @property {string} title
 * @property {string} season
 * @property {'movie' | 'anime' | 'manga' | 'video game' | 'event'} category
 * @property {string[]} genre
 * @property {string} releaseDate
 * @property {string} [studio]
 * @property {string} [platform]
 */
