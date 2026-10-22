import { expect, test, type Page } from '@playwright/test'

async function expectBrand(page: Page) {
  const brand = page.getByRole('img', { name: 'AuraTrade', exact: true }).filter({ visible: true })
  await expect(brand).toHaveCount(1)
  await expect(brand).toBeInViewport()
  const image = brand.locator('img')
  await expect(image).toHaveAttribute('src', '/brand/aura-mark.svg')
  await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true)
  await expect(image).toHaveCSS('width', '40px')
  await expect(image).toHaveCSS('height', '40px')
}

test('custom aura crest renders on auth, sidebar, mobile and browser icons in both themes', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  for (const [url, type] of [['/brand/aura-mark.svg', 'image/svg+xml'], ['/brand/apple-touch-icon.png', 'image/png']]) {
    const asset = await page.request.get(url, { maxRedirects: 0 })
    expect(asset.status()).toBe(200)
    expect(asset.headers()['content-type']).toContain(type)
  }
  for (const url of ['/brand/private', '/brand/aura-mark.svg/private', '/brand/aura-markXsvg', '/private.svg', '/dashboard']) {
    const protectedPage = await page.request.get(url, { maxRedirects: 0 })
    expect(protectedPage.status()).toBe(307)
    expect(new URL(protectedPage.headers().location, 'http://localhost').pathname).toBe('/login')
  }
  await page.goto('/register')
  await expectBrand(page)
  const email = `playwright-brand-${Date.now()}@example.com`
  await page.getByLabel('Name', { exact: true }).fill('Brand Review')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.waitForURL(/\/login\?registered=1$/)

  for (const mode of ['dark', 'light'] as const) {
    if (mode === 'light') await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
    await expectBrand(page)
    await page.screenshot({ path: testInfo.outputPath(`login-${mode}.png`) })
  }
  // Both desktop story and mobile form use the same mark and accessible name.
  await page.setViewportSize({ width: 390, height: 844 })
  await expectBrand(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('playwright-pass-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/dashboard$/)
  await expectBrand(page)
  await page.screenshot({ path: testInfo.outputPath('sidebar-light.png') })
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expectBrand(page)
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
  await expectBrand(page)
  await page.screenshot({ path: testInfo.outputPath('sidebar-compact-dark.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectBrand(page)

  const svgIcon = page.locator('link[rel="icon"][type="image/svg+xml"]')
  await expect(svgIcon).toHaveAttribute('href', '/brand/aura-mark.svg')
  const svg = await page.request.get((await svgIcon.getAttribute('href'))!)
  expect(svg.ok()).toBe(true)
  expect(svg.headers()['content-type']).toContain('image/svg+xml')
  const appleIcon = page.locator('link[rel="apple-touch-icon"]')
  await expect(appleIcon).toHaveAttribute('href', '/brand/apple-touch-icon.png')
  const apple = await page.request.get((await appleIcon.getAttribute('href'))!)
  expect(apple.ok()).toBe(true)
  expect(apple.headers()['content-type']).toContain('image/png')
  const ico = await page.request.get('/favicon.ico')
  expect(ico.ok()).toBe(true)
  const bytes = await ico.body()
  expect(bytes.readUInt16LE(2)).toBe(1)
  expect(bytes.readUInt16LE(4)).toBe(3)
})
