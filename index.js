'use strict'

const assert = require('node:assert')

const { action: downloadTDG } = require('./actions/download-tdg')
const { action: notifyUser } = require('./actions/telegram-notification')

async function run (args, env) {
  const action = args[0]

  console.log(`Executing action: ${action}`)
  switch (action) {
    case 'download-tdg': {
      assert.ok(env.TDG_USER, 'TDG_USER is required')
      assert.ok(env.TDG_PASSWORD, 'TDG_PASSWORD is required')
      assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')

      const result = await downloadTDG(args, env)
      await notifyUser(env, [
        { type: 'message', payload: `Read ${result.fileName}` },
        { type: 'file', payload: result.savePath }
      ])
      break
    }
    case 'read-chat-id': {
      assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')
      await notifyUser(env, [
        { type: 'message', payload: `The chat id is: ${env.TDG_FILTER}` },
      ])
      break
    }
    default:
      throw new Error(`Action ${action} not found`)
  }
}

run(process.argv.slice(2), process.env)
  .then(() => console.log('Done'))
  .catch(error => console.error('Error:', error))
