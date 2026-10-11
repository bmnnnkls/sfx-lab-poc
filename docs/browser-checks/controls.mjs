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
// Wiring to a socket needs both ends on screen, and the demo's cards are tall: give the editor room (the splitter, from the keyboard).
await page.getByRole('separator', { name: 'Resize editor' }).focus()
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp')
const wiresBefore = await wireCount()

// ---- the new nodes are offered; a card with no sockets of its own shows only what it has
for (const name of ['Control', 'XY pad', 'Switch', 'Selector', 'Add', 'Multiply', 'Invert', 'Min', 'Max', 'Clamp', 'Map range', 'Quantize', 'Smooth', 'Mix', 'Compare', 'MIDI to Hz', 'Hz to MIDI']) {
  check(`the picker offers ${name}`, await offers(name))
}
await add('Control')
await selectNode('Control')
check('a Control card appears, and its Value slider is in the property editor', (await node('Control').count()) === 1 && (await slider('Value').count()) === 1)
check('the card itself has no slider', (await node('Control').locator('input').count()) === 0)
check('and a control output, but no sockets', (await node('Control').locator('[data-testid^="out-"]').count()) === 1 && (await node('Control').locator('[data-testid*="-param:"]').count()) === 0)

// ---- parameter sockets: hidden until wired or asked for
check('the Gain card shows no parameter socket to begin with', (await node('Gain').locator('[data-testid*="-param:"]').count()) === 0)
await sockets().check()
check('the Sockets toggle shows one per numeric parameter', (await node('Gain').locator('[data-testid*="-param:"]').count()) === 1 && (await node('Filter').locator('[data-testid*="-param:"]').count()) === 3)
await page.screenshot({ path: `${dir}/controls-sockets.png` })

// ---- real audio: the Control replaces Gain's own value
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(1200)
const loud = await level(1500)
check('the bass plays', loud > 0.02, loud.toFixed(3))

await wire('Control', 'Gain', 'out', 'param:gain')
check('a wire into the Gain socket is drawn', (await wireCount()) === wiresBefore + 1)
await selectNode('Gain')
check('the Gain slider is disabled while the wire drives it, and says what drives it', (await slider('Gain').isDisabled()) && /Driven by Control/.test(await properties().innerText()))
await selectNode('Control')
await slider('Value').fill('0')
await page.waitForTimeout(1500)
const quiet = await level(1000)
check('the control at 0 silences the track (the wire replaces Gain\'s value of 1)', quiet < 0.005, quiet.toFixed(4))
await slider('Value').fill('1000')
await page.waitForTimeout(1200)
const back = await level(1500)
check('and at its maximum the sound is back', back > 0.02, back.toFixed(3))

// ---- unwired, the node uses its own value again; hidden sockets stay when wired
await sockets().uncheck()
check('with Sockets off the wired socket is still drawn, the others are gone', (await node('Gain').locator('[data-testid*="-param:"]').count()) === 1 && (await node('Filter').locator('[data-testid*="-param:"]').count()) === 0)
await surface.locator('[data-testid^="wire-"]').last().click({ force: true })
check('clicking the wire removes it', (await wireCount()) === wiresBefore)
await selectNode('Gain')
check('the Gain slider is usable again, and the socket hides', !(await slider('Gain').isDisabled()) && (await node('Gain').locator('[data-testid*="-param:"]').count()) === 0)
await selectNode('Control')
await slider('Value').fill('0')
await page.waitForTimeout(1200)
const unwired = await level(1500)
check('the control no longer matters: the sound is back', unwired > 0.02, unwired.toFixed(3))

// ---- undo brings the wire back, and a reload keeps it
await page.getByRole('button', { name: 'Undo' }).click() // the slider drag on the Control (one step)
await page.getByRole('button', { name: 'Undo' }).click() // the wire removal
check('undo restores the wire', (await wireCount()) === wiresBefore + 1)
await selectNode('Control')
await slider('Value').fill('0')
await page.waitForTimeout(2500) // the delay's echoes die away
const silentAgain = await level(1500)
check('and the control at 0 silences the track again', silentAgain < 0.005, silentAgain.toFixed(4))
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(800)
await page.reload()
await track('Bass')
check('after a reload the Control and its wire are still there', (await node('Control').count()) === 1 && (await wireCount()) === wiresBefore + 1)
check('with the wired socket drawn on the Gain card', (await node('Gain').locator('[data-testid*="-param:"]').count()) === 1)
await page.screenshot({ path: `${dir}/controls-wired.png` })

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
