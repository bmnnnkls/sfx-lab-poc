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

// ---- the new sources are offered
for (const name of ['Noise', 'Geiger', 'Perlin noise', 'Random']) check(`the picker offers ${name}`, await offers(name))

// ---- silence the instrument: take away what makes the sound, so what is added is all that is heard
await page.getByRole('button', { name: 'Remove Oscillator' }).click()
await page.getByRole('button', { name: 'Remove Filter' }).click()
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(1200)
const bare = await level(1200)
check('with the oscillator and filter gone the bass is silent', bare < 0.005, bare.toFixed(4))

// ---- noise
await add('Noise')
await wire('Noise', 'Output', 'out', 'in')
await page.waitForTimeout(1200)
const hiss = await level(1500)
check('noise wired to the output is heard', hiss > 0.05, hiss.toFixed(3))
await selectNode('Noise')
await properties().getByLabel('Colour', { exact: true }).selectOption({ label: 'brown' })
await page.waitForTimeout(1000)
check('brown noise is heard too', (await level(1500)) > 0.02)
await slider('Level').fill('0')
await page.waitForTimeout(1200)
check('and level 0 silences it', (await level(1200)) < 0.005)
await page.screenshot({ path: `${dir}/sources-noise.png` })
await page.getByRole('button', { name: 'Remove Noise' }).click()

// ---- geiger: crackle you can hear, and a trigger for other nodes
await add('Geiger')
await wire('Geiger', 'Output', 'click', 'in')
await selectNode('Geiger')
await slider('Rate').fill('300')
await page.waitForTimeout(1200)
const crackle = await level(1500)
check('geiger clicks are heard', crackle > 0.02, crackle.toFixed(3))
check('it has a Click and a Trigger output', (await node('Geiger').locator('[data-testid^="out-"]').count()) === 2)

// ---- random: a push button rolls it
await add('Random')
await add('Switch')
await wire('Switch', 'Random', 'out', 'roll')
await wire('Geiger', 'Random', 'trigger', 'roll')
check('a switch and a geiger trigger can both be wired into Roll', (await wireCount()) >= 3, String(await wireCount()))
await page.screenshot({ path: `${dir}/sources-random.png` })

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
check('the nodes survive a reload', (await node('Geiger').count()) === 1 && (await node('Random').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
