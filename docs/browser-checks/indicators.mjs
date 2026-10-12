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

await page.goto('http://localhost:4173/?starter')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await track('Bass')
await page.getByRole('separator', { name: 'Resize editor' }).focus()
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp')
const view = (name) => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }).click()
const face = (title) => node(title).locator('[data-testid^="indicator-"]')

// ---- the Indicators category
for (const name of ['LED', 'Number display', 'Bar meter']) check(`the picker offers ${name}`, await offers(name))
await addButton().click()
await pickerField().fill('')
check('and there is an Indicators category in it', (await page.locator('[role=option]', { hasText: /^Indicators/ }).count()) === 1)
await page.keyboard.press('Escape')

// ---- a control into the three indicators; audio must run for the engine to report
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(800)
await add('Control')
await add('Number display')
await add('LED')
await add('Bar meter')
await wire('Control', 'Number display', 'out', 'in')
await wire('Control', 'LED', 'out', 'in')
await wire('Control', 'Bar meter', 'out', 'in')
check('the control is wired to all three', (await wireCount()) >= 3 + 7, String(await wireCount()))
await selectNode('Control')
await slider('Value').fill('0')
await page.waitForTimeout(600)
check('the number display shows the control at 0', (await face('Number display').innerText()).includes('0.00'), await face('Number display').innerText())
check('the LED is dark', (await face('LED').locator('[role=img]').getAttribute('data-lit')) === 'false')
await slider('Value').fill('750')
await page.waitForTimeout(600)
check('turned to 0.75, the display shows it', (await face('Number display').locator('output').innerText()) === '0.75', await face('Number display').locator('output').innerText())
check('the LED lights', (await face('LED').locator('[role=img]').getAttribute('data-lit')) === 'true')
const fill = Number(await node('Bar meter').getByRole('meter').getAttribute('aria-valuenow'))
check('and the bar is three quarters full', Math.abs(fill - 0.75) < 0.02, fill.toFixed(3))
await page.screenshot({ path: `${dir}/indicators-graph.png` })

// ---- settings: decimals and a note name
await selectNode('Number display')
await slider('Decimals').fill('0')
await page.waitForTimeout(500)
check('with 0 decimals the display reads 1', (await face('Number display').locator('output').innerText()) === '1', await face('Number display').locator('output').innerText())

// ---- the same indicators are on the front panel
await view('Panel')
await page.waitForTimeout(600)
check('the panel shows the number, the light and the bar', (await page.getByRole('status').count()) + (await page.locator('output').count()) >= 1 && (await page.getByRole('img', { name: /LED: on/ }).count()) === 1 && (await page.getByRole('meter', { name: 'Bar meter' }).count()) === 1)
await page.screenshot({ path: `${dir}/indicators-panel.png` })
await view('Graph')

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
check('the indicators survive a reload', (await node('LED').count()) === 1 && (await node('Bar meter').count()) === 1 && (await node('Number display').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
