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

// Settings live in the property editor: select the node (click its header), then use its rows.
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const selectNode = (title) => node(title).locator('[class*="nodeHeader"]').first().click()
const slider = (label) => properties().getByRole('slider', { name: label, exact: true })
const valueField = (label) => properties().getByRole('textbox', { name: `${label} value`, exact: true })
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
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}`) })
const add = addNode
const effects = () => page.getByRole('button', { name: 'Effects', exact: true }).click()
const knob = (track, target) => page.getByLabel(`${track} send to ${target}`)
const LOOP = 'Demo Drum Loop 120 BPM'

await page.goto('http://localhost:4173/?starter')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()
const mixer = () => page.getByRole('button', { name: 'Mixer', exact: true }).click()
await mixer()
check('with no return tracks there are no send knobs', (await page.getByRole('group', { name: /sends$/ }).count()) === 0)

// ---- two returns; A gets a long wet reverb
for (const name of ['Return A', 'Return B']) {
  await page.getByRole('button', { name: 'Add track' }).click()
  await page.getByRole('menuitem', { name: 'Return track' }).click()
}
await trackBtn('Return A').click()
await effects()
await surface.locator('[data-testid^="wire-"]').first().click({ force: true })
await add('Stereo reverb')
await wire('Return in', 'Stereo reverb')
await wire('Stereo reverb', 'Track out')
await selectNode('Stereo reverb')
await slider('Size').fill('1000')
await slider('Mix').fill('1000')

await mixer()
check('the session-view headers have no send knobs any more', (await page.locator('[class*="_header_"]').getByLabel(/ send to /).count()) === 0)
const groups = page.getByRole('group', { name: /sends$/ })
check('every instrument and audio track shows a knob per return (4 tracks x 2)', (await groups.count()) === 4 && (await page.getByLabel(/ send to Return [AB]$/).count()) === 8, String(await groups.count()))
check('return tracks have no send knobs', (await page.getByLabel(/^Return [AB] send to/).count()) === 0)
const tip = await page.locator('label[title*="Return A"]').first().getAttribute('title')
check('the knob carries the return\'s real name, not a letter', (await page.getByRole('group', { name: 'Audio 4 sends' }).getByText('Return A', { exact: true }).count()) === 1)
check('the knob says it is post-fader', /post-fader/.test(tip ?? ''), tip)
await page.screenshot({ path: `${dir}/sends-mixer.png` })

// ---- no send, no tail
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(3600)
const none = await level(700)
check('with the knob at 0 nothing reaches the return: silence after the clip stops', none < 0.003, `peak=${none.toFixed(4)}`)

// ---- post-fader: with the knob up but the track turned all the way down, nothing is sent (and nothing is heard)
await knob('Audio 4', 'Return A').fill('1')
await page.getByLabel(/^Audio \d+ volume$/).fill('0')
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(3000)
const down = await level(1200)
check('post-fader: a track turned all the way down sends nothing either', down < 0.005, `peak=${down.toFixed(4)}`)
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(3000)
await page.getByLabel(/^Audio \d+ volume$/).fill('0.8')

// ---- send turned up: the return reverb rings after the clip stops
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(3600)
const tail = await level(700)
check('with the knob up the return reverb rings on after the clip stops', tail > 0.003, `peak=${tail.toFixed(4)}`)
check('the other return is unaffected (its knob is still 0)', (await knob('Audio 4', 'Return B').inputValue()) === '0')

// ---- undo merges a drag of one knob into one step
await knob('Audio 4', 'Return B').fill('0.2')
await knob('Audio 4', 'Return B').fill('0.5')
await knob('Audio 4', 'Return B').fill('0.7')
await page.getByRole('button', { name: 'Undo' }).click()
check('dragging one knob is one undo step', (await knob('Audio 4', 'Return B').inputValue()) === '0', await knob('Audio 4', 'Return B').inputValue())
await page.getByRole('button', { name: 'Redo' }).click()
check('and redo puts the last value back', (await knob('Audio 4', 'Return B').inputValue()) === '0.7')

// ---- removing a return takes its knob away; undo brings it back with its value
await page.getByRole('button', { name: 'Remove Return B' }).click()
check('removing a return removes its knob on every track', (await page.getByLabel(/send to Return B$/).count()) === 0 && (await page.getByLabel(/send to Return A$/).count()) === 4)
await page.getByRole('button', { name: 'Undo' }).click()
check('undo brings the return, its knobs and the knob value back', (await knob('Audio 4', 'Return B').inputValue()) === '0.7')

// ---- the knob and a Send node add up and use the same return
await trackBtn('Audio').click()
await effects()
await add('Send')
await properties().getByLabel('Send to return track').selectOption({ label: 'Return A' })
await wire('Track in', 'Send')
check('a Send node can be added next to the knob for the same return', (await node('Send').count()) === 1)

// ---- persistence
await page.reload()
await mixer()
check('knob values survive a reload', (await knob('Audio 4', 'Return A').inputValue()) === '1' && (await knob('Audio 4', 'Return B').inputValue()) === '0.7')

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
