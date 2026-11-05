import { defineConfig } from '@playwright/test'
import { SMOKE_GROUPS } from './tests/browser/groups'

/** Another port lets a second checkout (a worktree) run its browser tests at the same time. */
const port = Number(process.env.PW_PORT ?? 4173)

export default defineConfig({
  testDir: './tests/browser',
  // Files run in parallel, the tests inside a file in order. Audio specs are timing-sensitive and run alone.
  fullyParallel: false,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1500, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    // `--project='smoke-*'` runs every group; `--project=smoke-samples` one of them.
    ...SMOKE_GROUPS.map((group) => ({ name: `smoke-${group}`, testDir: `./tests/browser/${group}`, testMatch: '*.smoke.spec.ts', workers: 2 })),
    { name: 'audio', testDir: './tests/browser/audio', testMatch: '*.audio.spec.ts', timeout: 60_000, workers: 1 },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { BASE_PATH: '/' },
  },
})
