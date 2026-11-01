import { expect, test } from './fixtures'

test('a dev build is not updatable and offers the download page', async ({ app }) => {
  expect(await app.invoke('updates:state')).toEqual({ supported: false, phase: 'idle' })
  expect(await app.invoke('updates:check')).toEqual({ supported: false, phase: 'idle' })
  await app.page.evaluate(() => {
    location.hash = '#/settings'
  })
  await expect(app.page.getByRole('button', { name: 'Download-Seite öffnen' })).toBeVisible()
  await expect(app.page.getByRole('switch', { name: 'Automatische Updates' })).toHaveCount(0)
})

test('automatic updates default to off and the setting persists', async ({ app }) => {
  expect((await app.invoke('settings:get')).autoUpdate).toBe(false)
  await app.invoke('settings:update', { autoUpdate: true })
  expect((await app.invoke('settings:get')).autoUpdate).toBe(true)
  expect((await app.invoke('updates:state')).phase).toBe('idle')
})
