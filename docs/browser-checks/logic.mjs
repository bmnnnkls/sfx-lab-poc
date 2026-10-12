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

// ---- the Logic category
for (const name of ['Schmitt trigger', 'Edge detect', 'Flip-flop', 'Counter', 'Clock', 'Clock divider', 'Control delay']) check(`the picker offers ${name}`, await offers(name))
await addButton().click()
await pickerField().fill('')
check('and there is a Logic category in it', (await page.locator('[role=option]', { hasText: /^Logic/ }).count()) === 1)
await page.keyboard.press('Escape')

// ---- silence the instrument, then hear a clock: its square wave reaches the output as thumps
await page.getByRole('button', { name: 'Remove Oscillator' }).click()
await page.getByRole('button', { name: 'Remove Filter' }).click()
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(1200)
check('with the oscillator and filter gone the bass is silent', (await level(1200)) < 0.005)
await add('Clock')
await wire('Clock', 'Output', 'out', 'in')
await page.waitForTimeout(1200)
check('a clock wired to the output is heard', (await level(1500)) > 0.05)
await selectNode('Clock')
await slider('Width').fill('100')
await properties().getByLabel('Per', { exact: true }).selectOption({ label: 'BPM' })
check('Per offers Hz, BPM and beat', (await properties().getByLabel('Per', { exact: true }).locator('option').allTextContents()).join() === 'Hz,BPM,beat')

// ---- chains: clock -> divider -> counter -> flip-flop, a schmitt and an edge detector
await add('Clock divider')
await add('Counter')
await add('Flip-flop')
await wire('Clock', 'Clock divider', 'out', 'in')
await wire('Clock divider', 'Counter', 'out', 'trigger')
await wire('Clock divider', 'Flip-flop', 'out', 'trigger')
check('clock into divider, counter and flip-flop: three wires more', (await wireCount()) >= 4, String(await wireCount()))
await add('Schmitt trigger')
await add('Edge detect')
await wire('Schmitt trigger', 'Edge detect', 'out', 'in')
check('a schmitt trigger feeds an edge detector', (await wireCount()) >= 5, String(await wireCount()))
await page.screenshot({ path: `${dir}/logic.png` })

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
check('the nodes survive a reload', (await node('Counter').count()) === 1 && (await node('Edge detect').count()) === 1 && (await node('Clock').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
