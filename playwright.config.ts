import { defineConfig } from '@playwright/test'

// Each test starts its own Electron instance with a fresh profile.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  outputDir: 'test-results'
})
