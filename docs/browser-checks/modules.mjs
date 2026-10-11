import { createRequire } from 'node:module'
const require = createRequire('/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2]
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
const nodeByTitle = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator(`[class*="nodeTitle"]`, { hasText: new RegExp(`^${title}`) }) })
const crumb = (name) => page.getByLabel('Patch location').getByRole('button', { name, exact: true })
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}$`) })
const header = (title) => nodeByTitle(title).first().locator('[class*="nodeHeader"]')

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
await page.waitForTimeout(300)

// ---- select two nodes and group
await header('Oscillator').click()
await header('Filter').click({ modifiers: ['Shift'] })
check('two nodes selected', (await surface.locator('[data-selected="true"]').count()) === 2)
await page.getByRole('button', { name: /Group into module \(2\)/ }).click()
check('a module node replaces them', (await nodeByTitle('Module 1').count()) === 1 && (await nodeByTitle('Oscillator').count()) === 0)
check('the palette now offers the module', (await offers('Module 1')) === true)
check('the wiring around it survived (wires drawn)', (await surface.locator('[data-testid^="wire-"]').count()) >= 5, String(await surface.locator('[data-testid^="wire-"]').count()))
await page.screenshot({ path: `${dir}/19-grouped.png` })

// ---- still plays
await page.locator('[class*="_launch_"]').first().click()
const heard = await level(2500)
check('the grouped instrument still sounds', heard > 0.02, heard.toFixed(3))
await page.getByRole('button', { name: /^Stop/ }).first().click().catch(() => {})

// ---- edit inside, expose a knob
await nodeByTitle('Module 1').getByRole('button', { name: 'Edit' }).click()
check('breadcrumb shows we are inside the module', (await page.getByRole('navigation', { name: 'Patch location' }).innerText()).includes('Module 1'))
check('inside, the oscillator and filter are visible', (await nodeByTitle('Oscillator').count()) === 1 && (await nodeByTitle('Filter').count()) === 1)
check('usage says it is used once', /Used 1×/.test(await page.getByTestId('module-usage').innerText()))
await page.getByLabel('Module name').fill('Wobble core')
const filterId = (await nodeByTitle('Filter').first().getAttribute('data-testid')).replace('node-', '')
await page.getByTestId(`expose-knob-${filterId}-cutoff`).check()
await page.getByLabel('Name of Cutoff').fill('Brightness')
await page.screenshot({ path: `${dir}/20-inside.png` })
await crumb('Bass').click()
check('back out: the use is named Wobble core and shows a Brightness knob', (await nodeByTitle('Wobble core').count()) === 1 && (await nodeByTitle('Wobble core').getByText('Brightness').count()) === 1)

// ---- the knob is live (its value display follows, and the instrument keeps playing)
const knobBox = nodeByTitle('Wobble core').locator('label', { hasText: 'Brightness' })
const before = await knobBox.locator('[class*="paramValue"]').innerText()
await knobBox.locator('input[type=range]').fill('900')
const after = await knobBox.locator('[class*="paramValue"]').innerText()
check('turning the module knob changes its value', before !== after, `${before} -> ${after}`)
await page.locator('[class*="_launch_"]').first().click()
check('and the instrument keeps sounding', (await level(1500)) > 0.02)
await page.getByRole('button', { name: /^Stop/ }).first().click().catch(() => {})

// ---- second use on another track shares the definition
await trackBtn('Lead').click()
await addNode('Wobble core')
check('Lead now has a use of the same module', (await nodeByTitle('Wobble core').count()) === 1)
await nodeByTitle('Wobble core').getByRole('button', { name: 'Edit' }).click()
check('usage says used twice, in Bass and Lead', /Used 2× \(Bass, Lead\)/.test(await page.getByTestId('module-usage').innerText()), await page.getByTestId('module-usage').innerText())
check('a used module cannot be deleted', await page.getByRole('button', { name: 'Delete module' }).isDisabled())
await crumb('Lead').click()

// ---- unlink the Lead's use
await nodeByTitle('Wobble core').getByRole('button', { name: 'Unlink' }).click()
check('unlink turns the use into plain nodes', (await nodeByTitle('Wobble core').count()) === 0 && (await nodeByTitle('Filter').count()) === 2 && (await nodeByTitle('Oscillator').count()) === 2)
await trackBtn('Bass').click()
check('Bass still uses the module', (await nodeByTitle('Wobble core').count()) === 1)
await page.getByRole('button', { name: 'Undo' }).click()
await trackBtn('Lead').click()
check('undo of the unlink brings back the shared use', (await nodeByTitle('Wobble core').count()) === 1)

// ---- marquee selection
const box = await surface.boundingBox()
await page.mouse.move(box.x + 5, box.y + 5)
await page.mouse.down()
await page.mouse.move(box.x + 1100, box.y + 400, { steps: 8 })
await page.mouse.up()
check('dragging a box on empty canvas selects the nodes it touches', (await surface.locator('[data-selected="true"]').count()) >= 2, String(await surface.locator('[data-selected="true"]').count()))
await page.mouse.click(box.x + 3, box.y + 3)
check('clicking empty canvas clears the selection', (await surface.locator('[data-selected="true"]').count()) === 0)

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await trackBtn('Bass').click()
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
check('the module survives a reload', (await nodeByTitle('Wobble core').count()) === 1)
await page.locator('[class*="_launch_"]').first().click()
check('and still plays after reload', (await level(2000)) > 0.02)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
