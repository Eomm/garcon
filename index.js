'use strict'

const fs = require('node:fs')
const { parseArgs } = require('node:util')

// ! These commands map the Telegram command (configured in BotFather)
const mappedCommands = [
  require('./actions/download-tdg'),
  require('./actions/telegram-notification'),
  require('./actions/remind-me'),
]

/**
 *
 * @param {string} jsonString
 * @param {import('node:process').Env} env
 */
async function run (jsonString, env) {
  const telegramMsg = JSON.parse(jsonString)

  const actionToDo = mappedCommands.find(action => {
    try {
      return action.canHandle(telegramMsg)
    } catch (error) {
      // Ignrore error
      return false
    }
  })

  if (!actionToDo) {
    throw new Error('No action found for this message')
  }

  console.log(`Executing command: ${actionToDo.commandName}`)
  const opts = actionToDo.buildOptions(telegramMsg, env)
  await actionToDo.executeFlow(opts)
}

if (require.main === module) {
  // Production mode: run as script
  const options = {
    jsonPath: {
      type: 'string',
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
