'use strict'

const { exec } = require('node:child_process')
const { Telegraf } = require('telegraf')

async function configureWebhook (env) {
  const webhookUrl = await readWebhookUrl()
  console.log(`Setting webhook to ${webhookUrl}`)

  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  const result = await bot.telegram.setWebhook(webhookUrl)
  console.log(`Webhook set: ${result}`)
}

async function readWebhookUrl () {
  return new Promise((resolve, reject) => {
    exec("cd garcon-bot-app/ && sam list stack-outputs --profile eomm --output json | jq -r '.[] | select(.OutputKey == \"GarconTelegramApi\") | .OutputValue'", (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Error: ${error.message}`))
        return
      }
      if (stderr) {
        reject(new Error(`Stderr: ${stderr}`))
        return
      }

      resolve(stdout.trim())
    })
  })
}

configureWebhook(process.env)
