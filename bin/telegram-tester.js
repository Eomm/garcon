'use strict'

const { Telegraf } = require('telegraf')

const botBrain = require('../index')

async function echoChatId (env) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  bot.use(async ctx => {
    await botBrain(JSON.stringify(ctx.update), process.env)
  })

  bot.catch(async (err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err)
  })

  // ‼️ Don't forget to restore the webhook after running this script
  await bot.launch()

  process.once('SIGINT', () => bot.stop())
}

echoChatId(process.env)
