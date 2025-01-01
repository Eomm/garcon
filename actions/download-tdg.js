'use strict'
const path = require('node:path')
const { chromium } = require('playwright')

const URLs = new Map()
URLs.set('login', 'https://www.terradeigiochi.it/login?back=history')
URLs.set('magazine', 'https://www.terradeigiochi.it/1039-tdg-magazine')

async function downloadTDG (args, env) {
  const browser = await chromium.launch({
    headless: env.TDG_HEADLESS !== 'false',
  })
  const context = await browser.newContext()

  try {
    // Login
    const page = await context.newPage()
    await page.goto(URLs.get('login'))
    await page.locator('input[type="email"]').click()
    await page.locator('input[type="email"]').fill(env.TDG_USER)
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill(env.TDG_PASSWORD)
    await page.getByRole('button', { name: 'Accedi' }).click()

    // Buy the magazine
    await page.goto(URLs.get('magazine'))

    if (env.TDG_FILTER) {
      // 📝 filtered magazine (filtered)
      const month = env.TDG_FILTER
      const reg = new RegExp(`TDG Magazine: \\d+- ${month}`, 'i')
      const linkLocator = page.locator('role=link', { hasText: reg })
      await linkLocator.first().waitFor()
      await linkLocator.first().click()
    } else {
    //  📝 latest magazine
      await page.getByRole('link', { name: 'Nuovo' }).click()
    }
    await page.locator('#add-to-cart-or-refresh').getByRole('button', { name: ' Aggiungi al carrello' }).click()

    await page.getByRole('link', { name: ' Procedi con il checkout' }).click()
    await page.getByRole('link', { name: 'Procedi con il checkout' }).click()
    await page.getByRole('button', { name: 'Continua' }).click()
    await page.waitForTimeout(1000)
    await page.getByLabel('Accetto i termini del').check()
    await page.waitForSelector('button:enabled')
    await page.getByRole('button', { name: 'Procedi col pagamento' }).click()

    // Download the magazine in the browser
    await page.getByRole('link', { name: 'Dettagli' }).first().click()
    const downloadPromise = page.waitForEvent('download')

    const downloadLocator = page.locator('role=link', { hasText: /TDG Magazine: \d+-/ })
    await downloadLocator.first().waitFor()
    await downloadLocator.first().click()

    const download = await downloadPromise

    // Download the file payload
    const savePath = path.join(process.cwd(), env.TDG_ARTIFACT_NAME || download.suggestedFilename())
    await download.saveAs(savePath)
    console.log(`File downloaded to: ${savePath}`)

    return { savePath }
  } finally {
    await context.close()
    await browser.close()
  }
}

module.exports = {
  action: downloadTDG
}