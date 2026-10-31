import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), worker: resolve('src/preload/worker.ts') }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          worker: resolve('src/renderer/worker.html')
        }
      }
    }
  }
})
