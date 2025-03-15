'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { Telegraf } = require('telegraf')

async function echoChatId (env) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  bot.use(async ctx => {
    console.log(`Received message: ${ctx.message.message_id} from [${ctx.chat.id}]`)

    const savePath = path.resolve(__dirname, `../fixtures/msg-${ctx.message.message_id}.json`)
    fs.writeFileSync(savePath, JSON.stringify(ctx, null, 2))
  })

  bot.catch(async (err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err)
  })

  // ‼️ Don't forget to restore the webhook after running this script
  await bot.launch()

  process.once('SIGINT', () => bot.stop())
}

echoChatId(process.env)
