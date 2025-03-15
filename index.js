'use strict'

const fs = require('node:fs')
const { parseArgs } = require('node:util')

// ! These commands map the Telegram command (configured in BotFather)
const mappedCommands = {
  '/magazine': require('./actions/download-tdg'),
  '/chatid': require('./actions/telegram-notification'),
}

/**
 *
 * @param {string} jsonString
 * @param {import('node:process').Env} env
 */
async function run (jsonString, env) {
  const telegramMsg = JSON.parse(jsonString)

  const commandName = telegramMsg?.message?.text?.startsWith('/') && telegramMsg.message.text.split(' ')[0]
  const actionToDo = mappedCommands[commandName]
  if (!actionToDo) {
    throw new Error(`Action ${commandName} not found`)
  }

  console.log(`Executing command: ${commandName}`)
  const opts = actionToDo.buildOptions(telegramMsg, env)
  await actionToDo.executeFlow(opts)
}

if (require.main === module) {
  // Production mode: run as script
  const options = {
    jsonPath: {
      type: 'strict',
    },
  }
  const { values } = parseArgs({ options })
  const jsonString = fs.readFileSync(values.jsonPath, 'utf8')

  run(jsonString, process.env)
    .then(() => console.log('Done'))
    .catch(error => {
      console.error('Error:', error)
      process.exit(1)
    })
} else {
  // Test mode: run as module
  module.exports = run
}
