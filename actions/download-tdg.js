'use strict'
const path = require('node:path')
const assert = require('node:assert')
const { chromium } = require('playwright')

const notifyUser = require('./telegram-notification')

const URLs = new Map()
URLs.set('login', 'https://www.terradeigiochi.it/login?back=history')
URLs.set('checkout', 'https://www.terradeigiochi.it/carrello?action=show')
URLs.set('magazine', 'https://www.terradeigiochi.it/1039-tdg-magazine')

URLs.set('test', 'https://www.terradeigiochi.it/index.php?controller=order-detail&id_order=41941')

/**
 * @param {InputAction} options
 * @returns {Promise<{ fileName: string, savePath: string }>}
**/
async function downloadTDG (options) {
  const browser = await chromium.launch({
    headless: options.runHeadless,
    slowMo: 250,
  })
  const context = await browser.newContext()

  try {
    // Login
    const page = await context.newPage()
    await page.goto(URLs.get('login'))
    await page.locator('input[type="email"]').click()
    await page.locator('input[type="email"]').fill(options.tdgUser)
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill(options.tdgPassword)
    await page.getByRole('button', { name: 'Accedi' }).click()

    // Buy the magazine
    await page.goto(URLs.get('magazine'))

    if (options.filter) {
      // 📝 filtered magazine (filtered)
      const month = options.filter
      console.log(`Filtering megazine by [${month}]...`)
      const reg = new RegExp(`TDG Magazine: \\d+- ${month}`, 'i')
      const linkLocator = page.locator('role=link', { hasText: reg })
      await linkLocator.first().waitFor()
      await linkLocator.first().click()
    } else {
    //  📝 latest magazine
      console.log('Getting latest magazine...')
      await page.getByRole('link', { name: 'Nuovo' }).click()
    }

    await page.waitForSelector('#add-to-cart-or-refresh')
    await page.locator('#add-to-cart-or-refresh').getByRole('button', { name: ' Aggiungi al carrello' }).click()
    console.log('Added to cart')

    if (options.dryRun) {
      console.log('Skipping checkout...')
      await page.goto(URLs.get('test'))
    } else {
      console.log('Checking out...')
      await page.goto(URLs.get('checkout'))
      await page.getByRole('link', { name: 'Procedi con il checkout' }).click()
      await page.getByRole('button', { name: 'Continua' }).click()
      await page.waitForTimeout(1_000)
      await page.getByLabel('Accetto i termini del').check()
      await page.waitForSelector('button:enabled')
      await page.getByRole('button', { name: 'Procedi col pagamento' }).click()
      await page.getByRole('link', { name: 'Dettagli' }).first().click()
    }

    // Download the magazine in the browser
    const downloadPromise = page.waitForEvent('download')

    const downloadLocator = page.locator('role=link', { hasText: /TDG Magazine: \d+-/ })
    await downloadLocator.first().waitFor()
    await downloadLocator.first().click()

    console.log('Downloading magazine...')
    const download = await downloadPromise

    // Download the file payload
    const savePath = path.join(process.cwd(), options.artifactName || download.suggestedFilename())
    await download.saveAs(savePath)
    console.log(`File downloaded to: ${savePath}`)

    return {
      fileName: download.suggestedFilename(),
      savePath
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

/**
 * @param {import('telegraf').Telegraf} telegramMsg
 * @param {import('node:process').Env} env
 * @returns {InputAction}
 */
function buildOptions (telegramMsg, env) {
  assert.ok(env.TDG_USER, 'TDG_USER is required')
  assert.ok(env.TDG_PASSWORD, 'TDG_PASSWORD is required')
  assert.ok(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN is required')

  const text = telegramMsg.message.text
  const [, ...filters] = text.split(' ')
  return {
    tdgUser: env.TDG_USER,
    tdgPassword: env.TDG_PASSWORD,
    chatId: String(telegramMsg.message.chat.id),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    runHeadless: env.TDG_HEADLESS !== 'false',
    artifactName: env.TDG_ARTIFACT_NAME,
    filter: filters.join(' ') || null,
    dryRun: env.TDG_TEST === 'true'
  }
}

/**
 * @param {InputAction} options
 * @returns {Promise<{ fileName: string, savePath: string }>}
 */
async function executeFlow (options) {
  const result = await downloadTDG(options)

  await notifyUser.action(options, [
    { type: 'message', payload: `Read ${result.fileName}` },
    { type: 'file', payload: result.savePath }
  ])
}

module.exports = {
  commandName: 'download-tdg',
  canHandle: (telegramMsg) => telegramMsg.message.text.startsWith('/magazine'),
  action: downloadTDG,
  buildOptions,
  executeFlow
}

/**
 * @typedef {Object} InputAction
 * @property {string} tdgUser
 * @property {string} tdgPassword
 * @property {string} telegramBotToken
 * @property {string} chatId
 * @property {boolean} runHeadless
 * @property {string} artifactName
 * @property {string} filter
 * @property {boolean} dryRun
 */
