'use strict'

const { Telegraf } = require('telegraf')

async function notifyUser (env, steps) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  const chatId = env.TELEGRAM_CHAT_ID
  for (const step of steps) {
    console.log(`Sending ${step.type} to chat`)
    switch (step.type) {
      case 'message':
        await bot.telegram.sendMessage(chatId, step.payload)
        break
      case 'file':
        await bot.telegram.sendDocument(chatId, { source: step.payload })
        break
      default:
        throw new Error(`Step ${step} not found`)
    }
  }
}

module.exports = { action: notifyUser }
