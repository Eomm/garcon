'use strict'

// ! These commands map the Telegram command (configured in BotFather)
const mappedCommands = {
  '/magazine': require('./actions/download-tdg'),
  '/chatid': require('./actions/telegram-notification'),
}

async function run (args, env) {
  const telegramMsg = JSON.parse(args[0])

  const commandName = telegramMsg?.message?.text?.startsWith('/') && telegramMsg.message.text.split(' ')[0]
  const actionToDo = mappedCommands[commandName]
  if (!actionToDo) {
    throw new Error(`Action ${commandName} not found`)
  }

  console.log(`Executing command: ${commandName}`)
  const params = actionToDo.buildOptions(telegramMsg, env)
  await actionToDo.executeFlow(params)
}

if (require.main === module) {
  // Production mode: run as script
  run(process.argv.slice(2), process.env)
    .then(() => console.log('Done'))
    .catch(error => console.error('Error:', error))
} else {
  // Test mode: run as module
  module.exports = run
}
