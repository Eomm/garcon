'use strict'

const { Telegraf } = require('telegraf')
const { message } = require('telegraf/filters')

async function echoChatId (env) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  bot.on(message('text'), async ctx => {
    console.log(`Received message: ${ctx.message.text} from [${ctx.chat.id}]`)
    await ctx.reply(`Your chat ID is: ${ctx.chat.id}`)
  })

  bot.catch(async (err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err)
  })

  await bot.launch()

  process.once('SIGINT', () => bot.stop())
}

echoChatId(process.env)
