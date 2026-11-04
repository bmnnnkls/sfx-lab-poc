import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  // Overridden in CI so the app works when served from a sub-path (GitHub Pages).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep stable framework/menu dependencies cacheable across application edits.
          // Match package boundaries and both path separators; leave the warning limit intact.
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'ui-vendor', test: /node_modules[\\/](@radix-ui|@floating-ui)[\\/]/ },
            { name: 'layout-vendor', test: /node_modules[\\/]flexlayout-react[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@core': fromRoot('./src/core'),
      '@audio': fromRoot('./src/audio'),
      '@storage': fromRoot('./src/storage'),
      '@state': fromRoot('./src/state'),
      '@ui': fromRoot('./src/ui'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
