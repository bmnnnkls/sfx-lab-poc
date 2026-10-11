import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(existsSync('/node-tools/node_modules/') ? '/node-tools/node_modules/' : '/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)

// The page's own meter only shows the louder channel, so tap the real output of the engine's worklet per channel.
await page.addInitScript(() => {
  const Original = window.AudioWorkletNode
  window.AudioWorkletNode = class extends Original {
    constructor(ctx, name, options) {
      super(ctx, name, options)
      const split = ctx.createChannelSplitter(2)
      this.connect(split)
      const analysers = [0, 1].map((channel) => {
        const analyser = ctx.createAnalyser()
        split.connect(analyser, channel)
        return analyser
      })
      window.__channelRms = () =>
        analysers.map((analyser) => {
          const data = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(data)
          return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
        })
    }
  }
})

/** The largest RMS seen on each channel over a window. */
const channels = async (ms) => {
  const best = [0, 0]
  const end = Date.now() + ms
  while (Date.now() < end) {
    const now = await page.evaluate(() => window.__channelRms?.() ?? [0, 0])
    best[0] = Math.max(best[0], now[0])
    best[1] = Math.max(best[1], now[1])
    await page.waitForTimeout(40)
  }
  return best
}
const surface = page.getByTestId('patch-surface')
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace('node-', '')
const wire = async (fromTitle, toTitle, fromPort = 'out', toPort = 'in') => {
  const a = await page.getByTestId(`out-${await idOf(fromTitle)}-${fromPort}`).boundingBox()
  const b = await page.getByTestId(`in-${await idOf(toTitle)}-${toPort}`).boundingBox()
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}`) })
const add = (name) => page.getByRole('button', { name, exact: true }).click()
const LOOP = 'Demo Drum Loop 120 BPM'

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()
await trackBtn('Audio').click()
await page.getByRole('button', { name: 'Effects', exact: true }).click()

// ---- untouched: the same in both channels
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
const plain = await channels(1500)
check('a track without effects is the same in both channels', plain[0] > 0.02 && Math.abs(plain[0] - plain[1]) < 0.002, JSON.stringify(plain))

// ---- pan
await add('Pan')
await surface.locator('[data-testid^="wire-"]').first().click({ force: true }) // cut the direct wire
await wire('Track in', 'Pan')
await wire('Pan', 'Track out')
check('Track in (mono) -> Pan -> Track out (stereo) is wired', (await wireCount()) === 2, String(await wireCount()))
await node('Pan').locator('input[type=range]').first().fill('0') // hard left
await page.waitForTimeout(500)
const left = await channels(1200)
check('panned hard left: sound only on the left', left[0] > 0.02 && left[1] < 0.001, JSON.stringify(left))
await node('Pan').locator('input[type=range]').first().fill('1000') // hard right
await page.waitForTimeout(500)
const right = await channels(1200)
check('panned hard right: sound only on the right', right[1] > 0.02 && right[0] < 0.001, JSON.stringify(right))
await page.screenshot({ path: `${dir}/stereo-pan.png` })

// ---- a mono node cannot take stereo until it is switched to stereo
await node('Pan').locator('input[type=range]').first().fill('250')
await add('Filter')
await wire('Pan', 'Filter')
check('a stereo output does not wire into a mono Filter', (await wireCount()) === 2, String(await wireCount()))
await node('Filter').getByRole('button', { name: 'Filter: mono' }).click()
check('the Filter can be switched to stereo', (await node('Filter').getByRole('button', { name: 'Filter: stereo' }).count()) === 1)
await wire('Pan', 'Filter')
check('and then the stereo wire is accepted', (await wireCount()) === 3, String(await wireCount()))
await node('Filter').getByRole('button', { name: 'Filter: stereo' }).click()
check('switching it back to mono drops the wire that no longer fits', (await wireCount()) === 2, String(await wireCount()))
await page.getByRole('button', { name: 'Remove Filter' }).click()
await page.getByRole('button', { name: 'Remove Pan' }).click()

// ---- stereo reverb widens a mono sample
await add('Stereo reverb')
await wire('Track in', 'Stereo reverb')
await wire('Stereo reverb', 'Track out')
const mixKnob = node('Stereo reverb').locator('input[type=range]').nth(3)
await mixKnob.fill('1000')
await page.waitForTimeout(600)
const wet = await channels(1500)
check('a stereo reverb on the mono loop gives both channels sound', wet[0] > 0.01 && wet[1] > 0.01, JSON.stringify(wet))
const snapshot = async () => page.evaluate(() => window.__channelRms())
let different = 0
for (let i = 0; i < 10; i++) { const [l, r] = await snapshot(); if (Math.abs(l - r) > 1e-4) different++; await page.waitForTimeout(60) }
check('...and the two channels differ (an untouched mono track gives exactly equal ones)', different >= 8, `${different}/10 snapshots`)
await page.screenshot({ path: `${dir}/stereo-reverb.png` })

// ---- persistence
await page.reload()
await trackBtn('Audio').click()
await page.getByRole('button', { name: 'Effects', exact: true }).click()
check('the stereo graph survives a reload', (await node('Stereo reverb').count()) === 1 && (await wireCount()) === 2)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
