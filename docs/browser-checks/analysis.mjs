import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(existsSync('/node-tools/node_modules/') ? '/node-tools/node_modules/' : '/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1500, height: 1400 } })
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

// Settings live in the property editor: select the node (click its header), then use its rows.
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const selectNode = (title) => node(title).locator('[class*="nodeHeader"]').first().click()
const slider = (label) => properties().getByRole('slider', { name: label, exact: true })
const valueField = (label) => properties().getByRole('textbox', { name: `${label} value`, exact: true })

const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
const surface = page.getByTestId('patch-surface')
const tab = (name) => page.getByRole('button', { name, exact: true }).first().click()
const track = (name) => page.locator('[class*="_trackName_"]', { hasText: name }).first().click()
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace(/^node-/, '')
const add = addNode
const sockets = () => page.getByRole('checkbox', { name: 'Sockets' })
const wire = async (fromTitle, toTitle, fromPort, toPort) => {
  const a = await page.getByTestId(`out-${await idOf(fromTitle)}-${fromPort}`).boundingBox()
  const b = await page.getByTestId(`in-${await idOf(toTitle)}-${toPort}`).boundingBox()
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await track('Bass')
await page.getByRole('separator', { name: 'Resize editor' }).focus()
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp')

// ---- the Analysis category
for (const name of ['Envelope follower', 'Level (dB)', 'Pitch detector']) check(`the picker offers ${name}`, await offers(name))
await addButton().click()
await pickerField().fill('')
check('and there is an Analysis category in it', (await page.locator('[role=option]', { hasText: /^Analysis/ }).count()) === 1)
await page.keyboard.press('Escape')

// ---- an envelope follower listening to the oscillator drives the filter's cutoff: the bass keeps playing
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(1200)
const before = await level(1500)
check('the bass plays', before > 0.02, before.toFixed(3))
await add('Envelope follower')
await sockets().check()
await wire('Oscillator', 'Envelope follower', 'out', 'in')
await wire('Envelope follower', 'Filter', 'out', 'param:cutoff')
check('the follower is wired in from the oscillator and out to the cutoff socket', (await wireCount()) >= 2)
await selectNode('Filter')
check('the Cutoff slider is disabled while the follower drives it', await slider('Cutoff').isDisabled())
await page.waitForTimeout(1500)
const during = await level(1500)
check('the bass still plays, now with the cutoff following its own loudness', during > 0.005, during.toFixed(3))
await selectNode('Envelope follower')
await properties().getByLabel('Mode', { exact: true }).selectOption({ label: 'rms' })
check('the follower has Peak and RMS', (await properties().getByLabel('Mode', { exact: true }).locator('option').allTextContents()).join() === 'peak,rms')

// ---- level and pitch: they connect to a note's sound and their outputs are controls
await add('Level (dB)')
await add('Pitch detector')
await wire('Oscillator', 'Level \\(dB\\)', 'out', 'in')
await wire('Oscillator', 'Pitch detector', 'out', 'in')
check('level and pitch detector can listen to the oscillator', (await wireCount()) >= 4, String(await wireCount()))
check('the pitch detector has Freq and Sure outputs', (await node('Pitch detector').locator('[data-testid^="out-"]').count()) === 2)
await page.screenshot({ path: `${dir}/analysis.png` })

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
check('the nodes survive a reload', (await node('Envelope follower').count()) === 1 && (await node('Pitch detector').count()) === 1 && (await node('Level \\(dB\\)').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
