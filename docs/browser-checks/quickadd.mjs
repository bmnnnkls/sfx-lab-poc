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

// Settings live in the property editor: select the node (click its header), then use its rows.
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const selectNode = (title) => node(title).locator('[class*="nodeHeader"]').first().click()
const slider = (label) => properties().getByRole('slider', { name: label, exact: true })
const valueField = (label) => properties().getByRole('textbox', { name: `${label} value`, exact: true })

const surface = page.getByTestId('patch-surface')
const popup = () => page.getByTestId('quick-add')
const field = () => page.getByRole('combobox', { name: 'Add a node' })
const options = () => popup().getByRole('option')
const optionLabels = async () => options().evaluateAll((els) => els.map((el) => el.dataset.label))
const activeLabel = async () => page.locator('[role=option][aria-selected=true]').getAttribute('data-label')
const addButton = () => page.getByRole('button', { name: 'Add', exact: true })
const track = (name) => page.locator('[class*="_trackName_"]', { hasText: name }).first().click()
const tab = (name) => page.getByRole('button', { name, exact: true }).first().click()
const nodes = () => surface.locator('[data-testid^="node-"]')
const node = (title) => nodes().filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) })
const boxOf = (locator) => locator.first().boundingBox()

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await track('Bass')
const start = await nodes().count()

// ---- the Add button opens it on the categories
check('the old row of buttons is gone: no button per node type', (await page.getByRole('button', { name: 'Oscillator', exact: true }).count()) === 0)
check('it is closed to begin with', (await popup().count()) === 0)
await addButton().click()
check('Add opens the picker with the field focused', (await popup().count()) === 1 && (await field().evaluate((el) => el === document.activeElement)))
let labels = await optionLabels()
check('empty, it lists the categories', JSON.stringify(labels) === JSON.stringify(['Sources', 'Controls', 'Modulation', 'Math', 'Filters', 'Effects', 'Routing']), labels.join(','))
check('each with how many nodes it holds', (await options().first().innerText()).replace(/\s+/g, ' ') === 'Sources 3 ›' && (await page.locator('[data-label="Math"]').innerText()).replace(/\s+/g, ' ') === 'Math 13 ›')
check('the first row is highlighted and named by aria-activedescendant', (await activeLabel()) === 'Sources' && (await field().getAttribute('aria-activedescendant')) === (await page.locator('[role=option][aria-selected=true]').getAttribute('id')))
await page.screenshot({ path: `${dir}/quickadd-categories.png` })

// ---- drilling in and back
await page.keyboard.press('Enter')
check('Enter drills into the category', JSON.stringify(await optionLabels()) === JSON.stringify(['Note', 'Oscillator', 'Sampler']))
check('and the popup is still open', (await popup().count()) === 1)
await page.keyboard.press('Backspace')
check('Backspace on the empty field goes back up', (await optionLabels()).length === 7 && (await activeLabel()) === 'Sources')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
check('Down moves the highlight', (await activeLabel()) === 'Modulation')
await page.keyboard.press('ArrowUp')
check('Up moves it back', (await activeLabel()) === 'Controls')
await page.keyboard.press('Enter')
check('a category opens with Enter wherever the highlight is', JSON.stringify(await optionLabels()) === JSON.stringify(['Control', 'XY pad', 'Switch']))
await page.screenshot({ path: `${dir}/quickadd-controls.png` })

// ---- typing searches everything and ranks
await field().fill('reverb')
labels = await optionLabels()
check('typing searches across everything, best first', labels[0] === 'Reverb' && labels.length >= 1, labels.join(','))
check('a row shows the label, its category and what it does', /Reverb\s*Effects\s*Puts the sound in a room/.test((await options().first().innerText()).replace(/\s+/g, ' ')))
await field().fill('mdhz')
check('letters in order find it too', (await optionLabels())[0] === 'MIDI to Hz', (await optionLabels()).join(','))
await field().fill('wobble echoes')
check('every word must match: nothing found says so', (await optionLabels()).length === 0 && (await popup().innerText()).includes('Nothing matches'))
await page.keyboard.press('Enter')
check('Enter with nothing found does nothing', (await popup().count()) === 1 && (await nodes().count()) === start)

// ---- adding with Enter
await field().fill('gain')
await page.keyboard.press('Enter')
check('Enter adds the highlighted node and closes the picker', (await popup().count()) === 0 && (await nodes().count()) === start + 1)
check('the new node is the selection', (await node('Gain').last().getAttribute('data-selected')) === 'true')
check('focus returns to the Add button', await addButton().evaluate((el) => el === document.activeElement))
const firstGain = await boxOf(node('Gain').last())
const view = await page.locator('[class*="scroller"]').first().boundingBox()
check('it lands in the visible middle of the canvas', firstGain.x > view.x && firstGain.x + firstGain.width < view.x + view.width && firstGain.y >= view.y - 1 && firstGain.y < view.y + view.height, JSON.stringify([firstGain, view]))
await page.getByRole('button', { name: 'Undo' }).click()
check('adding is one undo step', (await nodes().count()) === start)
await page.getByRole('button', { name: 'Redo' }).click()
check('and redo brings it back', (await nodes().count()) === start + 1)

// ---- adding with the mouse; several in a row fan out
await addButton().click()
await field().fill('delay')
await options().first().hover()
await options().first().click()
check('a click on a row adds it', (await node('Delay').count()) === 2 && (await popup().count()) === 0)
await addButton().click(); await field().fill('gain'); await page.keyboard.press('Enter')
await addButton().click(); await field().fill('gain'); await page.keyboard.press('Enter')
const gains = await Promise.all((await node('Gain').all()).slice(-3).map((n) => n.boundingBox()))
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
check('three nodes added in a row do not sit on each other', !overlap(gains[0], gains[1]) && !overlap(gains[1], gains[2]) && !overlap(gains[0], gains[2]))

// ---- double-click on empty canvas: where it was clicked, no marquee, selection kept
const before = await nodes().count()
await node('Oscillator').locator('[class*="nodeHeader"]').first().click()
check('a node is selected', (await node('Oscillator').first().getAttribute('data-selected')) === 'true')
const spot = { x: view.x + view.width - 70, y: view.y + 60 } // empty canvas, right of the cards, left of the property editor
await page.mouse.dblclick(spot.x, spot.y)
check('a double-click on empty canvas opens the picker', (await popup().count()) === 1)
const popupBox = await popup().boundingBox()
check('at the pointer (kept inside the window)', Math.abs(popupBox.x - Math.min(spot.x, 1500 - popupBox.width - 8)) < 3 && Math.abs(popupBox.y - spot.y) < 3, JSON.stringify([popupBox, spot]))
check('without a selection box left behind', (await page.locator('[class*="marquee"]').count()) === 0)
check('and the selection the first click would have cleared is still there', (await node('Oscillator').first().getAttribute('data-selected')) === 'true')
await field().fill('invert')
await page.keyboard.press('Enter')
const inverted = await boxOf(node('Invert'))
check('the node is placed where it was clicked', Math.abs(inverted.x + inverted.width / 2 - spot.x) < 3 && Math.abs(inverted.y + 14 - spot.y) < 3, JSON.stringify([inverted, spot]))
check('and only that node is selected afterwards', (await node('Invert').first().getAttribute('data-selected')) === 'true' && (await node('Oscillator').first().getAttribute('data-selected')) === 'false')
check('one node was added', (await nodes().count()) === before + 1)
await page.screenshot({ path: `${dir}/quickadd-dblclick.png` })

const blank = { x: view.x + 60, y: view.y + 22 } // empty canvas above the cards, where nothing else sits
// ---- a plain click still clears the selection, and a drag still draws a marquee
await page.mouse.click(blank.x, blank.y)
check('a single click on empty canvas still clears the selection', (await surface.locator('[data-selected=true]').count()) === 0 && (await popup().count()) === 0)
await page.waitForTimeout(600) // not a double-click with the click before
await page.mouse.move(blank.x, blank.y)
await page.mouse.down()
await page.mouse.move(blank.x + 90, blank.y + 22, { steps: 4 })
check('and a drag still draws the selection box', (await page.locator('[class*="marquee"]').count()) === 1)
await page.mouse.up()

// ---- Shift+A over the canvas
await page.waitForTimeout(600)
await page.mouse.move(blank.x, blank.y)
await page.keyboard.press('Shift+A')
check('Shift+A over the canvas opens the picker at the pointer', (await popup().count()) === 1 && Math.abs((await popup().boundingBox()).x - Math.min(blank.x, 1500 - 340 - 8)) < 3, JSON.stringify(await popup().boundingBox()))
await page.keyboard.type('A')
check('typing a capital A into the field types it, it does not reopen anything', (await field().inputValue()) === 'A' && (await popup().count()) === 1)
await page.keyboard.press('Escape')
check('Escape closes it', (await popup().count()) === 0)
await page.mouse.move(300, 300)
await page.keyboard.press('Shift+A')
check('Shift+A away from the canvas does nothing', (await popup().count()) === 0)

// ---- closing by clicking elsewhere
await addButton().click()
await page.mouse.click(300, 300)
check('a press outside the picker closes it', (await popup().count()) === 0)

// ---- what is offered follows the graph
await tab('Effects')
await addButton().click()
await field().fill('Track in')
check('the Effects tab offers the ends of its graph', (await optionLabels()).includes('Track in'))
await field().fill('Note')
check('but not note-driven nodes', !(await optionLabels()).includes('Note') && !(await optionLabels()).includes('Sampler'))
await page.keyboard.press('Escape')
await tab('Notes')
await addButton().click()
check('the Notes tab opens on the note graph categories only', JSON.stringify(await optionLabels()) === JSON.stringify(['Sources', 'Effects', 'Routing']), (await optionLabels()).join(','))
await field().fill('arp')
check('and finds its own nodes', (await optionLabels())[0] === 'Arpeggiator')
await page.keyboard.press('Enter')
check('and adds one', (await node('Arpeggiator').count()) === 1)
await tab('Instrument')

// ---- survives a reload
await page.waitForTimeout(700)
await page.reload()
await track('Bass')
check('the nodes added from the picker are saved', (await node('Invert').count()) === 1 && (await node('Gain').count()) === 4)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
