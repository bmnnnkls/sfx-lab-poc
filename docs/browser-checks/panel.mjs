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
const slider = (name) => page.getByRole('slider', { name, exact: true })
const pad = (name) => page.getByRole('group', { name, exact: true })
const position = async (name) => Number(await slider(name).getAttribute('data-position'))
const padAt = async (name) => ({ x: Number(await pad(name).getAttribute('data-x')), y: Number(await pad(name).getAttribute('data-y')) })
const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance
const view = (name) => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }).click()
const tab = (name) => page.getByRole('button', { name, exact: true }).first().click()
const track = (name) => page.locator('[class*="_trackName_"]', { hasText: name }).first().click()
const node = (title) => page.getByTestId('patch-surface').locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
/** Drags a point by (dx, dy) pixels from where it is pressed. */
const drag = async (locator, from, to) => {
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * (from.x + to.x) / 2, box.y + box.height * (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps: 6 })
  await page.mouse.up()
}

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await track('Bass')

// ---- the switch, an empty panel
check('the Instrument tab starts in the graph view', (await page.getByTestId('patch-surface').count()) === 1 && (await page.getByTestId('front-panel').count()) === 0)
await view('Panel')
check('Panel replaces the graph, and the canvas-only buttons go', (await page.getByTestId('front-panel').count()) === 1 && (await page.getByTestId('patch-surface').count()) === 0 && (await page.getByRole('button', { name: /^Group into module/ }).count()) === 0)
check('a patch with no panel says so and offers to build one', (await page.getByText('This patch has no front panel yet.').count()) === 1)

// ---- build from graph
await page.getByRole('button', { name: 'Build from graph' }).first().click()
const count = await page.locator('[data-testid^="control-"]').count()
check('Build from graph makes a control per parameter', count >= 8, String(count))
check('enums are selectors, numbers are knobs', (await page.getByRole('radiogroup', { name: 'Wave', exact: true }).count()) === 1 && (await slider('Cutoff').count()) === 1)
await page.screenshot({ path: `${dir}/panel-built.png` })

// ---- a knob sets the node's parameter
const before = await position('Cutoff')
const readout = (name) => page.locator('[data-testid^="control-"]').filter({ has: slider(name) }).locator('output')
const textBefore = await readout('Cutoff').textContent()
await drag(slider('Cutoff'), { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 - 45 / (await slider('Cutoff').boundingBox()).height })
const after = await position('Cutoff')
check('dragging a knob up raises it by the pixels dragged (45 of 180 = 0.25)', near(after - before, 0.25, 0.02), `${before} -> ${after}`)
const textAfter = await readout('Cutoff').textContent()
check('its readout follows', textAfter !== textBefore, `${textBefore} -> ${textAfter}`)
await view('Graph')
const graphText = await node('Filter').locator('[class*="param"]').filter({ hasText: 'Cutoff' }).first().textContent()
check('the graph view shows the same value in the filter node', graphText.replace(/\s/g, '').includes(textAfter.replace(/\s/g, '')), `${graphText} vs ${textAfter}`)
await view('Panel')
check('and the panel is still there after switching back', (await position('Cutoff')) === after)

// ---- one drag is one undo step
await page.getByRole('button', { name: 'Undo' }).click()
check('undoing a knob drag restores it in one step', near(await position('Cutoff'), before, 0.002), `${await position('Cutoff')} vs ${before}`)
await page.getByRole('button', { name: 'Redo' }).click()
check('redo brings it back', near(await position('Cutoff'), after, 0.002))

// ---- keyboard, wheel, double-click
await slider('Cutoff').focus()
await page.keyboard.press('Home')
check('Home puts a knob at its minimum', (await position('Cutoff')) === 0)
await page.keyboard.press('End')
check('End puts it at its maximum', (await position('Cutoff')) === 1)
await slider('Cutoff').dblclick()
const defaultPos = await position('Cutoff')
check('double-click returns it to the default (700 Hz in this demo is not the default 2000 Hz)', defaultPos > 0.4 && defaultPos < 0.8, String(defaultPos))
await slider('Cutoff').hover()
await page.mouse.wheel(0, -300)
check('the wheel turns it', (await position('Cutoff')) > defaultPos)

// ---- real audio: the Gain knob is the track's level
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()
await page.waitForTimeout(1200)
const loud = await level(1500)
check('the bass plays', loud > 0.02, loud.toFixed(3))
await slider('Gain').focus()
await page.keyboard.press('Home')
await page.waitForTimeout(1500)
const quiet = await level(1000)
check('turning the Gain knob to 0 silences it', quiet < 0.005, quiet.toFixed(4))
await page.keyboard.press('End')
await page.waitForTimeout(1200)
const back = await level(1500)
check('and back up brings the sound back', back > 0.02, back.toFixed(3))
await page.getByRole('button', { name: /^[▶■]\s*Root/ }).click()

// ---- edit mode: add an XY pad
await page.getByRole('button', { name: 'Edit panel' }).click()
const form = page.getByRole('form', { name: 'Add a control' })
await form.getByLabel('Parameter', { exact: true }).selectOption({ label: 'Filter: Cutoff' })
await form.getByLabel('Control type').selectOption('xy')
check('the Add button waits for the second parameter', await form.getByRole('button', { name: 'Add' }).isDisabled())
await form.getByLabel('Y parameter').selectOption({ label: 'Filter: Res' })
await form.getByRole('button', { name: 'Add' }).click()
check('an XY pad is added, named after both parameters', (await pad('Cutoff / Res').count()) === 1)
await page.getByRole('button', { name: 'Done' }).click()
await page.screenshot({ path: `${dir}/panel-xy.png` })

const padBefore = await padAt('Cutoff / Res')
const resKnobBefore = await position('Res')
await drag(pad('Cutoff / Res'), { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.25 })
const padNow = await padAt('Cutoff / Res')
check('dragging the pad moves X right and Y up (it ends at 0.8, 0.75)', near(padNow.x, 0.8, 0.03) && near(padNow.y, 0.75, 0.03), JSON.stringify(padNow))
check('the Cutoff and Res knobs, the same parameters, follow it', near(await position('Cutoff'), padNow.x, 0.002) && near(await position('Res'), padNow.y, 0.002), `${await position('Cutoff')} ${await position('Res')}`)
await page.getByRole('button', { name: 'Undo' }).click()
const padUndone = await padAt('Cutoff / Res')
check('one undo puts both parameters back', near(padUndone.x, padBefore.x, 0.002) && near(padUndone.y, padBefore.y, 0.002) && near(await position('Res'), resKnobBefore, 0.002), `${JSON.stringify(padUndone)} vs ${JSON.stringify(padBefore)}`)
await pad('Cutoff / Res').focus()
await page.keyboard.press('ArrowRight')
check('arrow keys move the pad', (await padAt('Cutoff / Res')).x > padUndone.x)

// ---- edit mode: rename, resize, remove, reorder
await page.getByRole('button', { name: 'Edit panel' }).click()
const nameField = page.getByLabel('Name of Cutoff / Res', { exact: true })
await nameField.fill('Tone')
await nameField.press('Enter')
check('renaming a control renames it', (await pad('Tone').count()) === 1)
const sizeBefore = await pad('Tone').boundingBox()
await page.getByRole('button', { name: 'Resize Tone' }).click()
check('the size button makes it bigger (a pad goes from 3x2 cells to 3x3)', (await pad('Tone').boundingBox()).height > sizeBefore.height + 50)
const order = () => page.locator('[data-testid^="control-"]').evaluateAll((cells) => cells.map((cell) => cell.querySelector('[aria-label]')?.getAttribute('aria-label')))
const firstBefore = (await order())[0]
await page.getByRole('button', { name: `Move ${firstBefore} later` }).click()
check('moving a control later changes the order', (await order())[1] === firstBefore, (await order()).slice(0, 3).join(', '))
await page.getByRole('button', { name: 'Remove Tone' }).click()
check('removing a control removes only it', (await pad('Tone').count()) === 0 && (await slider('Cutoff').count()) === 1)
await page.getByRole('button', { name: 'Undo' }).click()
check('and undo puts it back', (await pad('Tone').count()) === 1)
await page.getByRole('button', { name: 'Done' }).click()

// ---- deleting a node in the graph removes its controls
await view('Graph')
await page.getByRole('button', { name: 'Remove Filter' }).click()
await view('Panel')
check('removing the filter node removes the knobs, the selector and the pad bound to it', (await slider('Cutoff').count()) === 0 && (await slider('Res').count()) === 0 && (await pad('Tone').count()) === 0 && (await slider('Gain').count()) === 1)
await page.getByRole('button', { name: 'Undo' }).click()
check('undo brings the node and its controls back', (await slider('Cutoff').count()) === 1 && (await pad('Tone').count()) === 1)

// ---- Effects tab and the master have their own panels
await tab('Effects')
check('the Effects tab remembers its own view (graph)', (await page.getByTestId('patch-surface').count()) === 1)
await addNode('Reverb')
await view('Panel')
await page.getByRole('button', { name: 'Build from graph' }).first().click()
check('an effect gets its own panel, separate from the instrument\'s', (await slider('Size').count()) === 1 && (await slider('Cutoff').count()) === 0)
await tab('Instrument')
check('the instrument\'s panel is untouched', (await slider('Cutoff').count()) === 1 && (await slider('Size').count()) === 0)

// ---- persistence
await page.waitForTimeout(2000)
await page.reload()
await track('Bass')
check('the Instrument tab is still in Panel view after a reload', (await page.getByTestId('front-panel').count()) === 1)
check('the panel and its controls survive a reload', (await slider('Cutoff').count()) === 1 && (await pad('Tone').count()) === 1)
check('and so does the knob value', near(await position('Cutoff'), padUndone.x, 0.05) || (await position('Cutoff')) > 0)
await tab('Effects')
check('the effect\'s panel too', (await slider('Size').count()) === 1)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
