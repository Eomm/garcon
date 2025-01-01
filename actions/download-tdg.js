'use strict'
const path = require('node:path')
const { chromium } = require('playwright')

const URLs = new Map()
URLs.set('login', 'https://www.terradeigiochi.it/login?back=history')
URLs.set('magazine', 'https://www.terradeigiochi.it/1039-tdg-magazine')

async function downloadTDG (args, env) {
  const browser = await chromium.launch({
    headless: false
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
    await page.getByRole('link', { name: 'Nuovo' }).click()
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
    await page.getByRole('link', { name: 'TDG Magazine: 34- Gennaio' }).click()
    const download = await downloadPromise
    // await expect(page.getByRole('cell', { name: 'TDG Magazine: 34- Gennaio' })).toBeVisible();
    // await expect(page.locator('#order-products')).toContainText('TDG Magazine');
    // await expect(page.locator('#order-products')).toMatchAriaSnapshot(`- 'link /TDG Magazine: \\d+- Gennaio \\d+ \\(Versione Digitale\\)/'`);

    // Download the file payload
    const savePath = path.join(process.cwd(), download.suggestedFilename())
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
