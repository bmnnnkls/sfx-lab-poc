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
const widget = (title) => node(title).locator('[data-testid^="widget-"]')
const pos = async (title) => { const b = await node(title).boundingBox(); return [Math.round(b.x), Math.round(b.y)] }

await add('Control')
await add('XY pad')
await add('Switch')
await add('Selector')
for (const title of ['Control', 'XY pad', 'Switch', 'Selector']) check(`the ${title} card holds its working widget`, (await widget(title).count()) === 1)
check('and the card has no picture or other settings besides', (await node('Control').locator('input').count()) === 0)
await page.screenshot({ path: `${dir}/widgets.png` })

// ---- a knob on the card: turning it writes the node's value, and it is the same value as the property editor's
await selectNode('Control')
const before = await valueField('Value').inputValue()
const knob = node('Control').getByRole('slider', { name: 'Control' })
const box = await knob.boundingBox()
const here = await pos('Control')
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 6 })
await page.mouse.up()
const after = await valueField('Value').inputValue()
check('dragging the knob on the card changes the value', before !== after, `${before} -> ${after}`)
check('and does not move the card', JSON.stringify(await pos('Control')) === JSON.stringify(here))
await page.getByRole('button', { name: 'Undo' }).click()
check('the whole drag is one undo step', (await valueField('Value').inputValue()) === before)
await knob.focus()
await page.keyboard.press('ArrowUp')
check('keys work on the card too', (await valueField('Value').inputValue()) !== before)

// ---- the property editor and the card are the same value
await slider('Value').fill('1000')
check('the property editor moves the knob on the card', (await knob.getAttribute('aria-valuenow')) !== null && Number(await knob.getAttribute('aria-valuenow')) > 0.95, await knob.getAttribute('aria-valuenow'))

// ---- the switch
const toggle = node('Switch').getByRole('switch')
await toggle.click()
check('a switch on the card toggles', (await toggle.getAttribute('aria-checked')) === 'true')
await selectNode('Switch')
check('and writes the node\'s On value', (await valueField('On').inputValue()) === '1')

// ---- the selector
const choices = node('Selector').getByRole('radio')
await choices.nth(2).click()
check('a selector on the card chooses a position', (await choices.nth(2).getAttribute('aria-checked')) === 'true')
await selectNode('Selector')
check('and writes it', (await valueField('Position').inputValue()) === '2')

// ---- the XY pad
const pad = node('XY pad').getByRole('group').first()
const pb = await pad.boundingBox()
const xBefore = await valueField('X').inputValue().catch(() => '')
await selectNode('XY pad')
const x0 = await valueField('X').inputValue()
await page.mouse.move(pb.x + pb.width * 0.2, pb.y + pb.height * 0.5)
await page.mouse.down()
await page.mouse.move(pb.x + pb.width * 0.8, pb.y + pb.height * 0.3, { steps: 6 })
await page.mouse.up()
check('dragging the pad on the card changes X', (await valueField('X').inputValue()) !== x0, `${x0} -> ${await valueField('X').inputValue()}`)

// ---- a card still drags by its header and is selected by pressing its widget
const moved = await pos('Switch')
const head = node('Switch').locator('[class*="nodeHeader"]').first()
const hb = await head.boundingBox()
await page.mouse.move(hb.x + 20, hb.y + 10)
await page.mouse.down()
await page.mouse.move(hb.x + 80, hb.y + 70, { steps: 5 })
await page.mouse.up()
const movedTo = await pos('Switch')
check('the header still drags the card', movedTo[0] !== moved[0] || movedTo[1] !== moved[1])

// ---- wires and heights: the ports sit where the card says they do (a wire lands on the socket)
await add('Gain')
await sockets().check()
await wire('Control', 'Gain', 'out', 'param:gain')
check('a wire from a control card with a widget reaches the socket', (await wireCount()) >= 8, String(await wireCount()))

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
check('the widgets are back after a reload', (await widget('Control').count()) === 1 && (await widget('XY pad').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
