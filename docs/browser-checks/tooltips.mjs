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

const surface = page.getByTestId('patch-surface')
const tip = () => page.getByRole('tooltip')
const track = (name) => page.locator('[class*="_trackName_"]', { hasText: name }).first().click()
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace(/^node-/, '')
const hover = async (locator) => { await locator.scrollIntoViewIfNeeded(); await locator.hover(); await page.waitForTimeout(600) }
const texts = async () => (await tip().innerText()).split('\n')

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await track('Bass')
// Wiring to a socket needs both ends on screen, and the demo's cards are tall: give the editor room (the splitter, from the keyboard).
await page.getByRole('separator', { name: 'Resize editor' }).focus()
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp')

// ---- the Add button
check('no tooltip until something is hovered', (await tip().count()) === 0)
await hover(addButton())
check('the Add button says how to add a node', (await tip().count()) === 1 && /double-click the canvas/.test(await tip().innerText()), await tip().count() ? (await texts())[0] : '')
await page.mouse.move(5, 5)
await page.waitForTimeout(200)
check('moving away hides it', (await tip().count()) === 0)

// ---- a parameter row: description, then range, unit, default, curve
await hover(node('Filter').locator('[class*="param"]').filter({ hasText: 'Cutoff' }).first())
let lines = await texts()
check('a parameter row says what it does', /frequency where the filter starts to cut/.test(lines[0] ?? ''), lines[0])
check('then its range, unit, default and curve', lines[1] === 'Range 20 Hz to 20000 Hz · default 2000 Hz · logarithmic', lines[1])
check('the tooltip sits inside the window', await tip().evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }))
await page.screenshot({ path: `${dir}/tooltips-param.png` })

// ---- an enum, a port, a node title
await hover(node('Oscillator').locator('[class*="param"]').filter({ hasText: 'Wave' }).first())
check('an enum lists its options', (await texts())[1] === 'Options: sine, saw, square, triangle · default saw' || (await texts())[1] === 'Options: sine, saw, square, triangle · default sine', (await texts())[1])
await hover(node('Oscillator').getByTestId(`in-${await idOf('Oscillator')}-pitch`))
check('an input port says what it is for', /Bends the pitch/.test((await texts())[0] ?? ''), (await texts())[0])
await hover(node('Delay').locator('[class*="nodeTitle"]'))
lines = await texts()
check('a node title says what it does', lines.length === 1 && /^Repeats the sound/.test(lines[0] ?? ''), lines.join(' | '))

// ---- a socket, free and driven
await page.getByRole('checkbox', { name: 'Sockets' }).check()
await hover(node('Gain').getByTestId(`in-${await idOf('Gain')}-param:gain`))
lines = await texts()
check('a socket describes its parameter, its range, and how to use it', /How loud/.test(lines[0] ?? '') && lines[1] === 'Range 0 to 2 · default 1' && /^Wire a control or a signal here/.test(lines[2] ?? ''), lines.join(' | '))

await addNode('Control')
const a = await page.getByTestId(`out-${await idOf('Control')}-out`).boundingBox()
const b = await page.getByTestId(`in-${await idOf('Gain')}-param:gain`).boundingBox()
await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
await page.mouse.down()
await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
await page.mouse.up()
await hover(node('Gain').locator('[class*="param"]').first())
lines = await texts()
check('a driven parameter says what drives it', lines.at(-1) === 'Driven by Control: the wire replaces this value.', lines.join(' | '))
await hover(node('Gain').getByTestId(`in-${await idOf('Gain')}-param:gain`))
check('and so does its socket', (await texts()).at(-1) === 'Driven by Control: the wire replaces the stored value.', (await texts()).join(' | '))
await hover(node('Control').locator('[class*="param"]').first())
check('a control shows its own range, not the wide bounds of its spec', (await texts())[1] === 'Range 0 to 1 · default 0.5', (await texts())[1])

// ---- dismissing, keyboard, and what it links to
await page.keyboard.press('Escape')
check('Escape hides it', (await tip().count()) === 0)
await hover(addButton())
check('while it shows the target is linked to it', (await addButton().getAttribute('aria-describedby')) === 'app-tooltip')
await page.mouse.down()
check('pressing hides it', (await tip().count()) === 0)
await page.mouse.up()
await page.keyboard.press('Escape')
await page.mouse.move(5, 5)
await page.getByRole('checkbox', { name: 'Sockets' }).focus()
await page.keyboard.press('Shift+Tab')
await page.waitForTimeout(100)
check('keyboard focus shows it at once, without the wait', (await tip().count()) === 1 && /double-click the canvas/.test(await tip().innerText()), await tip().count() ? (await texts())[0] : '')
await page.screenshot({ path: `${dir}/tooltips-focus.png` })

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
