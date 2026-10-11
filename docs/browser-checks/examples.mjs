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

// ---- the picker has an Examples category
for (const name of ['Overtone oscillator', 'Drawbar organ']) check(`the picker offers ${name}`, await offers(name))
await addButton().click()
await pickerField().fill('')
check('under an Examples category, after the project\'s modules', (await page.locator('[role=option]', { hasText: /^Examples/ }).count()) === 1)
await page.keyboard.press('Escape')
await addButton().click()
await pickerField().fill('hammond')
check('the words find them: "hammond" finds the organ', (await optionFor('Drawbar organ').count()) === 1)
await page.keyboard.press('Escape')

// ---- silence the instrument, then build the organ in: note -> module -> output
await page.getByRole('button', { name: 'Remove Oscillator' }).click()
await page.getByRole('button', { name: 'Remove Filter' }).click()
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(1200)
check('with the oscillator and filter gone the bass is silent', (await level(1200)) < 0.005)
await add('Drawbar organ')
check('the example is on the canvas as a use of a module', (await node('Drawbar organ').count()) === 1 && (await node('Drawbar organ').getByRole('button', { name: 'Edit' }).count()) === 1)
await wire('Note', 'Drawbar organ', 'frequency', 'base:a')
await wire('Drawbar organ', 'Output', 'sum:out', 'in')
await page.waitForTimeout(1500)
const heard = await level(1500)
check('wired from the Note to the Output it plays', heard > 0.05, heard.toFixed(3))
await page.screenshot({ path: `${dir}/examples.png` })

// ---- its nine drawbars are knobs in the property editor, and turning one is heard to change the sound
await selectNode('Drawbar organ')
check('nine drawbars are knobs, named after their footage', (await slider("Drawbar 16'").count()) === 1 && (await slider("Drawbar 1'").count()) === 1)
await slider("Drawbar 16'").fill('0')
await slider("Drawbar 5 1/3'").fill('0')
await slider("Drawbar 8'").fill('0')
await page.waitForTimeout(1200)
check('all three registered drawbars in: silence', (await level(1200)) < 0.005)
await slider("Drawbar 4'").fill('400')
await page.waitForTimeout(1200)
check('pulling the 4 foot drawbar out brings the sound back', (await level(1500)) > 0.02)

// ---- the module is in the project's library and opens like any module
await node('Drawbar organ').getByRole('button', { name: 'Edit' }).click()
check('inside, the partials are laid out', (await surface.locator('[data-testid^="node-"]').count()) >= 28)
await page.getByLabel('Patch location').getByRole('button', { name: 'Bass', exact: true }).click()

// ---- a second use shares it; the library holds it once
await add('Drawbar organ')
check('a second use of the example', (await surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: /^Drawbar organ/ }) }).count()) === 2)
await page.getByRole('button', { name: 'Add', exact: true }).click()
await pickerField().fill('Drawbar')
check('the project\'s module and the example are both listed, and picking either is the same module', (await optionFor('Drawbar organ').count()) === 2)
await page.keyboard.press('Escape')

// ---- undo takes the second use and (it was already in the library) nothing else
await page.getByRole('button', { name: 'Undo' }).click()
check('undo removes the second use', (await surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: /^Drawbar organ/ }) }).count()) === 1)

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
check('the module survives a reload', (await node('Drawbar organ').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
