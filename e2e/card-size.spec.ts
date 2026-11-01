import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'

const sizeButton = (page: Page, name: 'Kleine' | 'Mittlere' | 'Große') => page.getByRole('button', { name: `${name} Karten` })

const openDocuments = async (page: Page, query = ''): Promise<void> => {
  await page.evaluate((q) => {
    location.hash = `#/documents${q}`
  }, query)
}

test('cards default to medium', async ({ app }) => {
  const { page } = app
  await app.addDocument('rechnung', 'sonstiges')
  await openDocuments(page)
  await expect(sizeButton(page, 'Mittlere')).toHaveAttribute('aria-pressed', 'true')
})

test('an invalid stored size falls back to medium', async ({ app }) => {
  const { page } = app
  await page.evaluate(() => localStorage.setItem('cardSize', 'xxl'))
  await page.reload()
  await openDocuments(page)
  await expect(sizeButton(page, 'Mittlere')).toHaveAttribute('aria-pressed', 'true')
})

test('card size changes the card width', async ({ app }) => {
  const { page } = app
  await app.addDocument('rechnung', 'sonstiges')
  await openDocuments(page)
  const card = page.locator('[data-doc-index="0"]')
  await expect(card).toBeVisible()

  const widthAt = async (name: 'Kleine' | 'Mittlere' | 'Große'): Promise<number> => {
    await sizeButton(page, name).click()
    await expect(sizeButton(page, name)).toHaveAttribute('aria-pressed', 'true')
    return (await card.boundingBox())!.width
  }

  const small = await widthAt('Kleine')
  const medium = await widthAt('Mittlere')
  const large = await widthAt('Große')
  expect(small).toBeLessThan(medium)
  expect(medium).toBeLessThan(large)
})

test('card size is shared with the dashboard and survives a reload', async ({ app }) => {
  const { page } = app
  await app.addDocument('rechnung', 'sonstiges')
  await openDocuments(page)
  await sizeButton(page, 'Kleine').click()

  await page.getByRole('link', { name: 'Übersicht' }).first().click()
  await expect(page.getByRole('heading', { name: 'Zuletzt hinzugefügt' })).toBeVisible()
  await expect(sizeButton(page, 'Kleine')).toHaveAttribute('aria-pressed', 'true')

  await sizeButton(page, 'Große').click()
  await page.reload()
  await expect(sizeButton(page, 'Große')).toHaveAttribute('aria-pressed', 'true')
})

test('small cards hide the search snippet', async ({ app }) => {
  const { page } = app
  await app.addDocument('rechnung', 'sonstiges')
  await openDocuments(page, '?q=Inhalt')
  const snippet = page.locator('[data-doc-index="0"] p')

  await sizeButton(page, 'Mittlere').click()
  await expect(snippet).toBeVisible()
  await sizeButton(page, 'Kleine').click()
  await expect(snippet).toHaveCount(0)
})

test('the list view has no card size toggle', async ({ app }) => {
  const { page } = app
  await page.evaluate(() => localStorage.setItem('docView', 'list'))
  await page.reload()
  await openDocuments(page)
  await expect(page.getByRole('heading', { name: 'Dokumente' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Kartengröße' })).toHaveCount(0)
})
