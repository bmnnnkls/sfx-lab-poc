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
const add = addNode
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

// ---- the master strip
const master = page.getByRole('button', { name: 'Master', exact: true })
check('the session view has a Master strip', (await master.count()) === 1)
await master.click()
check('selecting it opens the Effects tab on the master graph', (await page.getByText('Master effects', { exact: true }).count()) === 1 && (await node('Master in').count()) === 1 && (await node('Track out').count()) === 1 && (await wireCount()) === 1)
check('its palette has Master in but not Track in, Return in or Send', (await offers('Master in')) === true && (await offers('Track in')) === false && (await offers('Return in')) === false && (await offers('Send')) === false)
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
check('the Instrument tab says the master has no instrument', (await page.getByText(/master bus has no instrument/).count()) === 1)
await page.getByRole('button', { name: 'Effects', exact: true }).click()

// ---- play the loop; the master gain controls everything
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
check('the loop is audible through the default master', (await level(1200)) > 0.1)
await add('Gain')
await surface.locator('[data-testid^="wire-"]').first().click({ force: true })
await wire('Master in', 'Gain')
check('a stereo master input does not wire into a mono Gain', (await wireCount()) === 0, String(await wireCount()))
await node('Gain').getByRole('button', { name: 'Gain: mono' }).click()
await wire('Master in', 'Gain')
await wire('Gain', 'Track out')
check('after the L R switch it wires in: Master in -> Gain -> Track out', (await wireCount()) === 2, String(await wireCount()))
check('the Master strip counts one effect', (await page.getByLabel('Master has 1 effect').count()) === 1)
await node('Gain').locator('input[type=range]').first().fill('0')
await page.waitForTimeout(500)
const muted = await level(1200)
check('a master gain of 0 silences every track', muted < 0.005, `peak=${muted.toFixed(4)}`)
await node('Gain').locator('input[type=range]').first().fill('500') // 1.0
await page.waitForTimeout(500)
check('and back up to 1 it plays again, same as before', (await level(1200)) > 0.1)

// ---- a reverb on the master: the tail rings after the clip stops, and survives a knob turn
await page.getByRole('button', { name: 'Remove Gain' }).click()
await add('Stereo reverb')
await wire('Master in', 'Stereo reverb')
await wire('Stereo reverb', 'Track out')
await node('Stereo reverb').locator('input[type=range]').nth(0).fill('1000')
await node('Stereo reverb').locator('input[type=range]').nth(3).fill('600')
await page.waitForTimeout(500)
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(3600)
const tail = await level(700)
check('a reverb on the master rings on after the clip has stopped', tail > 0.003, `peak=${tail.toFixed(4)}`)
await node('Stereo reverb').locator('input[type=range]').nth(1).fill('300')
const after = await level(500)
check('and a knob turn does not cut the tail', after > tail * 0.3, `after=${after.toFixed(4)}`)
await page.screenshot({ path: `${dir}/master.png` })

// ---- undo and persistence
await page.getByRole('button', { name: 'Undo' }).click()
await page.getByRole('button', { name: 'Redo' }).click()
check('edits of the master graph are undoable', (await node('Stereo reverb').count()) === 1)
await page.reload()
await page.getByRole('button', { name: 'Master', exact: true }).click()
check('the master graph survives a reload', (await node('Stereo reverb').count()) === 1 && (await wireCount()) === 2)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
