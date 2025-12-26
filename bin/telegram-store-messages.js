'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { Telegraf } = require('telegraf')

async function saveRawMessages (env) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  bot.use(async ctx => {
    console.log(`Received message: ${ctx.message.message_id} from [${ctx.chat.id}]`)

    const savePath = path.resolve(__dirname, `../fixtures/msg-${ctx.message.message_id}.json`)
    fs.writeFileSync(savePath, JSON.stringify(ctx, null, 2))
  })

  bot.catch(async (err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err)
  })

  process.once('SIGINT', () => {
    console.warn("‼️ Don't forget to restore the webhook after running this script")
    bot.stop()
  })

  process.nextTick(() => {
    console.log('Bot is listening for messages...')
  })
  await bot.launch()
}

saveRawMessages(process.env)
