import { appendFileSync, chmodSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

test('renaming a top-level category moves its files', async ({ app }) => {
  const top = await app.addDocument('oben', 'rechnung')
  const sub = await app.addDocument('unten', 'rechnung_telko')
  await app.openEditor()

  await app.page.locator('#rechnung-label').fill('Belege')
  await app.save()

  await expect(app.page.locator('[data-sonner-toast]').first()).toContainText('2 Dateien verschoben')
  expect(app.files().sort()).toEqual(['Belege/ohne-datum/oben.txt', 'Belege/ohne-datum/unten.txt'])
  expect((await app.invoke('documents:get', top.id)).category_id).toBe('rechnung')
  expect(app.sidecar(sub.id).relative_path).toBe('Dokumente/Belege/ohne-datum/unten.txt')
})

test('deleting a used category reassigns documents, trash and references', async ({ app }) => {
  const active = await app.addDocument('aktiv', 'vertrag')
  const trashed = await app.addDocument('geloescht', 'vertrag_miete')
  await app.invoke('documents:delete', trashed.id)
  await app.addReference('vertrag_miete')
  await app.openEditor()

  await app.page.getByRole('button', { name: 'Vertrag löschen' }).click()
  const dialog = app.page.getByRole('dialog')
  await expect(dialog).toContainText('3 Einträge')
  await dialog.getByRole('combobox').click()
  await app.page.getByRole('option', { name: 'Versicherung (allgemein)' }).click()
  await dialog.getByRole('button', { name: 'Löschen' }).click()
  await app.save()

  await expect(app.page.locator('#vertrag-label')).toHaveCount(0)
  await expect(app.page.locator('[data-sonner-toast]').first()).toBeVisible()
  expect(app.yaml()).not.toContain('id: vertrag')
  expect(app.sidecar(active.id).category_id).toBe('versicherung')
  expect(app.sidecar(active.id).relative_path).toBe('Dokumente/Versicherung/ohne-datum/aktiv.txt')
  expect(app.sidecar(trashed.id).category_id).toBe('versicherung')
  expect((await app.invoke('references:list'))[0].category_id).toBe('versicherung')
  expect(readFileSync(join(app.library, '.ablage/references.json'), 'utf8')).toContain('"versicherung"')
  expect(app.files()).toEqual(['Versicherung/ohne-datum/aktiv.txt'])
})

test('new categories get ids from their labels', async ({ app }) => {
  await app.openEditor()

  await app.page.getByRole('button', { name: 'Hauptkategorie' }).click()
  await app.page.locator('input[id$="-label"]').last().fill('Ärzte & Co')
  await app.page.locator('input[id$="-keywords"]').last().fill('arzt, arzt ,praxis')
  await app.page.getByRole('button', { name: 'Unterkategorie' }).last().click()
  await app.page.locator('input[id$="-label"]').last().fill('Labor')
  await app.page.getByRole('button', { name: 'Speichern' }).click()

  await expect(app.page.locator('#aerzte-co-label')).toHaveValue('Ärzte & Co')
  expect(app.yaml()).toContain('id: aerzte-co_labor')
  expect(app.yaml()).toContain('keywords: [arzt, praxis]')
})

test('the fallback category cannot be deleted and appears once in the picker', async ({ app }) => {
  await app.addDocument('aktiv', 'vertrag')
  await app.openEditor()

  await expect(app.page.getByRole('button', { name: 'Sonstiges löschen' })).toBeHidden()
  await app.page.getByRole('button', { name: 'Vertrag löschen' }).click()
  await app.page.getByRole('dialog').getByRole('combobox').click()
  await expect(app.page.getByRole('option', { name: /^Sonstiges/ })).toHaveCount(1)
})

test('a validation error keeps the draft, discard resets it', async ({ app }) => {
  await app.openEditor()

  await app.page.locator('#vertrag-label').fill('rechnung')
  await app.page.getByRole('button', { name: 'Speichern' }).click()

  await expect(app.page.locator('[data-sonner-toast]').first()).toContainText('mehrfach vergeben')
  await expect(app.page.locator('#vertrag-label')).toHaveValue('rechnung')
  await app.page.getByRole('button', { name: 'Verwerfen' }).click()
  await expect(app.page.locator('#vertrag-label')).toHaveValue('Vertrag')
  expect(app.yaml()).toContain('label: Vertrag')
})

test('a failed move is reported and heals on the next edit', async ({ app }) => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'needs POSIX permissions')
  const doc = await app.addDocument('datei', 'rechnung')
  await app.openEditor()
  const documents = join(app.library, 'Dokumente')
  chmodSync(documents, 0o555)
  try {
    await app.page.locator('#rechnung-label').fill('Belege')
    await app.save()
    await expect(app.page.locator('[data-sonner-toast]').first()).toContainText('1 Dokument nicht aktualisiert')
    expect((await app.invoke('documents:get', doc.id)).relative_path).toBe('Dokumente/Rechnung/ohne-datum/datei.txt')
    expect(app.yaml()).toContain('label: Belege')
  } finally {
    chmodSync(documents, 0o755)
  }

  const healed = await app.invoke('documents:update', doc.id, { title: doc.title })
  expect(healed.relative_path).toBe('Dokumente/Belege/ohne-datum/datei.txt')
})

test('other pages show a new label without a restart', async ({ app }) => {
  await app.addDocument('datei', 'rechnung')
  await app.page.evaluate(() => {
    location.hash = '#/documents'
  })
  await expect(app.page.getByText('Rechnung', { exact: true }).first()).toBeVisible()
  await app.openEditor()

  await app.page.locator('#rechnung-label').fill('Belege')
  await app.save()
  await expect(app.page.locator('[data-sonner-toast]').first()).toBeVisible()
  await app.page.evaluate(() => {
    location.hash = '#/documents'
  })

  await expect(app.page.getByText('Belege', { exact: true }).first()).toBeVisible()
})

test('a blank name shows a readable error', async ({ app }) => {
  await app.openEditor()

  await app.page.getByRole('button', { name: 'Unterkategorie' }).first().click()
  await app.page.getByRole('button', { name: 'Speichern' }).click()

  const toast = app.page.locator('[data-sonner-toast]').first()
  await expect(toast).toContainText('keinen Namen')
  await expect(toast).not.toContainText('too_small')
})

test('a save based on an outdated file is rejected', async ({ app }) => {
  await app.openEditor()
  appendFileSync(join(app.userData, 'categories.yaml'), '# extern\n')

  await app.page.locator('#vertrag-label').fill('Abkommen')
  await app.page.getByRole('button', { name: 'Speichern' }).click()

  await expect(app.page.locator('[data-sonner-toast]').first()).toContainText('inzwischen geändert')
  expect(app.yaml()).toContain('label: Vertrag')
})

test('leaving with unsaved changes asks first', async ({ app }) => {
  await app.openEditor()
  await app.page.locator('#vertrag-label').fill('Abkommen')

  await app.page.getByRole('button', { name: 'Einstellungen' }).first().click()
  const dialog = app.page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click()
  await expect(app.page.locator('#vertrag-label')).toHaveValue('Abkommen')

  await app.page.getByRole('button', { name: 'Einstellungen' }).first().click()
  await dialog.getByRole('button', { name: 'Verwerfen' }).click()
  await expect(app.page.getByRole('button', { name: 'Kategorien bearbeiten' })).toBeVisible()
})

test('a document arriving after an unused category was deleted does not block the save', async ({ app }) => {
  await app.openEditor()
  await app.page.getByRole('button', { name: 'Miete löschen' }).click()
  const doc = await app.addDocument('spaet', 'vertrag_miete')

  await app.page.getByRole('button', { name: 'Speichern' }).click()
  // The confirmation only appears once the refreshed usage has reached the editor.
  await app.page.getByRole('alertdialog').getByRole('button', { name: 'Speichern' }).click({ timeout: 1000 }).catch(() => undefined)

  await expect.poll(() => app.yaml()).not.toContain('id: vertrag_miete')
  await expect.poll(() => app.sidecar(doc.id).category_id).toBe('vertrag')
})

test('a case-only rename moves files and stays stable', async ({ app }) => {
  const doc = await app.addDocument('datei', 'rechnung')
  await app.openEditor()
  await app.page.locator('#rechnung-label').fill('RECHNUNG')
  await app.save()
  await expect(app.page.locator('[data-sonner-toast]').first()).toBeVisible()

  const updated = await app.invoke('documents:update', doc.id, { title: doc.title })
  expect(updated.relative_path).toBe('Dokumente/RECHNUNG/ohne-datum/datei.txt')
})

test('a failed move can be retried from the editor', async ({ app }) => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'needs POSIX permissions')
  const doc = await app.addDocument('datei', 'rechnung')
  await app.openEditor()
  const documents = join(app.library, 'Dokumente')
  chmodSync(documents, 0o555)
  try {
    await app.page.locator('#rechnung-label').fill('Belege')
    await app.save()
    await expect(app.page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible()
  } finally {
    chmodSync(documents, 0o755)
  }

  await app.page.getByRole('button', { name: 'Erneut versuchen' }).click()
  await expect(app.page.getByRole('button', { name: 'Erneut versuchen' })).toBeHidden()
  expect((await app.invoke('documents:get', doc.id)).relative_path).toBe('Dokumente/Belege/ohne-datum/datei.txt')
})
