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

// The node picker (Add button -> type -> pick). `offers(label)` asks whether it lists a node, without adding anything.
const addButton = () => page.getByRole('button', { name: 'Add', exact: true })
const pickerField = () => page.getByRole('combobox', { name: 'Add a node' })
const optionFor = (label) => page.locator(`[role=option][data-label="${label}"]`)
const addNode = async (label) => { await addButton().click(); await pickerField().fill(label); await optionFor(label).first().click() }
const offers = async (label) => { await addButton().click(); await pickerField().fill(label); const found = (await optionFor(label).count()) > 0; await page.keyboard.press('Escape'); return found }
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
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
const LOOP = 'Demo Drum Loop 120 BPM'

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

// ---- an audio track with a drum loop
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()
await trackBtn('Audio').click()

// ---- the Effects tab
await page.getByRole('button', { name: 'Effects', exact: true }).click()
check('the Effects tab shows Track in wired to Track out for an audio track', (await node('Track in').count()) === 1 && (await node('Track out').count()) === 1 && (await wireCount()) === 1)
check('its palette offers effects and the ends, but no note or sampler nodes', (await offers('Reverb')) === true && (await offers('Track in')) === true && (await offers('Note')) === false && (await offers('Sampler')) === false)
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
check('the Instrument tab of an audio track has no node picker, so it cannot offer Track in / Track out', (await addButton().count()) === 0)
await page.getByRole('button', { name: 'Effects', exact: true }).click()

// ---- the untouched graph changes nothing
check('silent before launching', (await level(300)) < 0.01)
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
const dry = await level(2000)
check('the loop is audible through the default graph', dry > 0.1, `peak=${dry.toFixed(3)}`)

// ---- a gain of zero between the ends silences the track (the direct wire is cut first)
await addNode('Gain')
await surface.locator('[data-testid^="wire-"]').first().click({ force: true })
check('clicking the direct wire removes it', (await wireCount()) === 0)
await wire('Track in', 'Gain')
await wire('Gain', 'Track out')
check('Track in -> Gain -> Track out is wired', (await wireCount()) === 2, String(await wireCount()))
check('the header says the track has one effect', (await page.getByLabel('Audio 2 has 1 effect').count()) + (await page.getByLabel(/has 1 effect$/).count()) >= 1)
const through = await level(1500)
check('with a unity-ish gain the loop still plays', through > 0.02, `peak=${through.toFixed(3)}`)
await node('Gain').locator('input[type=range]').first().fill('0')
await page.waitForTimeout(500)
const quiet = await level(1200)
check('turning the gain to 0 silences the track', quiet < 0.005, `peak=${quiet.toFixed(4)} value=${await node('Gain').locator('input[type=range]').first().inputValue()}`)
await page.screenshot({ path: `${dir}/fx-gain.png` })

// ---- a reverb replaces the gain: the tail rings on after the clip is stopped, and a knob turn does not cut it
await page.getByRole('button', { name: 'Remove Gain' }).click()
await addNode('Reverb')
await wire('Track in', 'Reverb')
await wire('Reverb', 'Track out')
const knob = (n) => node('Reverb').locator('input[type=range]').nth(n)
await knob(0).fill('1000') // size
await knob(3).fill('1000') // mix: wet only, so any sound after the stop is the tail
await page.waitForTimeout(500)
check('the loop plays through the reverb', (await level(1500)) > 0.02)
const playing = await level(1000)
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(3000) // a stop waits for the end of the bar (2.2 s at 110 BPM)
const tail = await level(600)
check('after the clip has stopped the reverb tail keeps sounding, quieter than the loop', tail > 0.003 && tail < playing, `tail=${tail.toFixed(4)} playing=${playing.toFixed(4)}`)
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(3500) // the launch waits for the bar too
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(4500)
const before = await level(300)
await knob(1).fill('300') // damping turned while the tail rings
const afterKnob = await level(500)
check('turning a knob while the tail rings does not cut it', before > 0.003 && before < 0.4 && afterKnob > before * 0.5, `before=${before.toFixed(4)} after=${afterKnob.toFixed(4)}`)
await page.screenshot({ path: `${dir}/fx-reverb.png` })

// ---- persistence
await page.reload()
await trackBtn('Audio').click()
await page.getByRole('button', { name: 'Effects', exact: true }).click()
check('the insert graph survives a reload', (await node('Reverb').count()) === 1 && (await wireCount()) === 2)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
