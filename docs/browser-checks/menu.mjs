import { createRequire } from 'node:module'
const require = createRequire('/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)

const PPB = 56, ROW = 16
const surface = () => page.getByTestId('note-surface')
const notes = () => page.locator('[data-note-id]')
const count = () => notes().count()
const selectedCount = () => page.locator('[data-note-id][class*="selected"]').count()
const lefts = () => notes().evaluateAll((els) => els.map((e) => Math.round(parseFloat(e.style.left) * 10) / 10))
const menu = () => page.getByRole('menu')
const item = (name) => page.getByRole('menuitem', { name: new RegExp('^' + name) })
const at = async (beat, pitch) => { const b = await surface().boundingBox(); return { x: b.x + beat * PPB, y: b.y + (127 - pitch) * ROW + ROW / 2 } }
const rightClick = async (p) => page.mouse.click(p.x, p.y, { button: 'right' })
const undo = () => page.getByRole('button', { name: 'Undo' }).click()

await page.goto('http://localhost:4173/?starter')
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sfxlab:editor-height', '720'); localStorage.setItem('sfxlab:roll-audition', 'false') })
await page.reload()
await page.getByRole('button', { name: 'Edit Root' }).click()
const start = await count()

// ---- context menu on a note
const note43 = page.locator('[data-pitch="43"]').first()
const nb = await note43.boundingBox()
await rightClick({ x: nb.x + nb.width / 2, y: nb.y + 8 })
await menu().waitFor()
const labels = await page.getByRole('menuitem').allTextContents()
check('right-click opens a menu (and deletes nothing)', (await menu().count()) === 1 && (await count()) === start)
check('menu offers copy / cut / paste / duplicate / delete / select all / quantize / humanize',
  ['Copy', 'Cut', 'Paste', 'Duplicate', 'Delete', 'Select all', 'Quantize', 'Humanize'].every((l) => labels.some((t) => t.startsWith(l))), JSON.stringify(labels))
check('right-clicking an unselected note selects it first', (await selectedCount()) === 1)
check('shortcuts are shown beside the items', labels.some((t) => /Ctrl\+C|⌘C/.test(t)))
check('Paste is disabled while the clipboard is empty', (await item('Paste').getAttribute('data-disabled')) !== null)
check('Quantize is scoped to the selection', labels.some((t) => t.startsWith('Quantize selection')))
await page.keyboard.press('Escape')
check('Escape closes the menu', (await menu().count()) === 0)
check('focus returns to the roll so shortcuts keep working', (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'note-surface')

// ---- Delete via menu
await rightClick({ x: nb.x + nb.width / 2, y: nb.y + 8 })
await item('Delete').click()
check('Delete in the menu removes the note', (await count()) === start - 1)
await undo()
check('...as one undo step', (await count()) === start)

// ---- Copy + Paste via menu, paste lands at the right-click position
await page.waitForTimeout(400)
await rightClick({ x: nb.x + nb.width / 2, y: nb.y + 8 })
await item('Copy').click()
const where = await at(2.5, 46)
await rightClick(where)
check('Paste enables once something is copied', (await item('Paste').getAttribute('data-disabled')) === null)
await item('Paste').click()
check('Paste adds the note', (await count()) === start + 1)
const pastedLeft = await page.locator('[data-note-id][class*="selected"]').evaluate((e) => Math.round(parseFloat(e.style.left)))
check('...exactly where the menu was opened (beat 2.5)', pastedLeft === 2.5 * PPB, `left=${pastedLeft}`)

// ---- keyboard navigation inside the menu
await page.keyboard.press('Escape')
const before = await count()
await rightClick(await at(0.5, 36))
await menu().waitFor()
await page.keyboard.press('ArrowDown')
const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
check('arrow keys move through the menu items', focused.length > 0, focused.slice(0, 20))
await page.keyboard.press('Escape')

// ---- double click still deletes
await page.waitForTimeout(400)
const victim = page.locator('[data-pitch="39"]').first()
const vb = await victim.boundingBox()
await page.mouse.click(vb.x + vb.width / 2, vb.y + 8)
await page.mouse.click(vb.x + vb.width / 2, vb.y + 8)
check('double-click still deletes a note', (await count()) === before - 1)

// ---- menu stays inside the window near the edges
const sb = await surface().boundingBox()
await rightClick({ x: sb.x + sb.width - 6, y: 818 }) // just above the velocity lane, near the window's bottom edge
await menu().waitFor()
const box = await menu().boundingBox()
check('menu flips to stay inside the window near the bottom edge', box.x >= 0 && box.y >= 0 && box.x + box.width <= 1400 && box.y + box.height <= 900, JSON.stringify(box))
await page.keyboard.press('Escape')

// ---- groove: humanize -> quantize
await page.evaluate(() => localStorage.setItem('sfxlab:roll-velocity', 'true'))
await page.reload()
await page.getByRole('button', { name: 'Edit Root' }).click()
const original = await lefts()
const onGrid = (xs) => xs.every((x) => Math.abs(x / 28 - Math.round(x / 28)) < 0.01)
check('starting pattern is on the 1/8 grid', onGrid(original), JSON.stringify(original))
await page.getByRole('button', { name: 'Groove' }).click()
check('groove panel says what it acts on', (await page.getByText('Acts on the whole clip').count()) === 1)
await page.getByLabel('Humanize timing').fill('100')
await page.getByRole('button', { name: 'Humanize', exact: true }).click()
const humanized = await lefts()
check('Humanize moves notes off the grid', !onGrid(humanized) && humanized.every((x) => Math.abs(x - original[humanized.indexOf(x)]) <= 14.01 + 1e-6), JSON.stringify(humanized))
const vel = await page.locator('[data-velocity]').evaluateAll((els) => els.map((e) => e.dataset.velocity))
check('...and varies velocities (30% default)', new Set(vel).size > 1, JSON.stringify(vel))
await page.getByRole('button', { name: 'Quantize', exact: true }).click()
const quantized = await lefts()
check('Quantize snaps them back onto the grid', onGrid(quantized), JSON.stringify(quantized))
await page.getByRole('button', { name: 'Quantize', exact: true }).click()   // second time: nothing to change
await undo()
check('quantizing an already-quantized clip adds no undo step (one undo returns to the humanized state)', JSON.stringify(await lefts()) === JSON.stringify(humanized))
await undo()
check('undo walks back to the original pattern', JSON.stringify(await lefts()) === JSON.stringify(original), JSON.stringify(await lefts()))

// ---- swing
await page.getByLabel('Swing amount').fill('75')
await page.getByRole('button', { name: 'Apply swing' }).click()
const swung = await lefts()
// Root notes at beats 0, 1, 1.5, 2, 3, 3.5: with the 1/8 grid, odd steps are 1.5 and 3.5 -> +0.25 beat (14 px)
// notes now: 36@0, 36@1, 43@1.5, 36@2, 41@3.5, 43@2.5 -> off-beats are 1.5, 3.5, 2.5 (+0.25 beat = 14 px); 41 is held back at the clip end (3.6 beats = 201.6 px)
check('Swing delays the off-beats only (and keeps notes inside the clip)', swung[0] === 0 && swung[1] === 56 && swung[2] === 98 && swung[3] === 112 && swung[4] === 201.6 && swung[5] === 154, JSON.stringify(swung))
await page.getByRole('button', { name: 'Apply swing' }).click()
check('swing is idempotent (applying again changes nothing)', JSON.stringify(await lefts()) === JSON.stringify(swung))

// ---- scope: with one note selected, only it is humanized
await undo() // back from the idempotent swing
await page.getByRole('button', { name: 'Groove' }).click() // close the panel
await page.waitForTimeout(450)
const preScope = await lefts()
const firstBox = await notes().first().boundingBox()
await page.mouse.click(firstBox.x + firstBox.width / 2, firstBox.y + 8)  // select the first note
check('one note selected', (await selectedCount()) === 1)
await page.getByRole('button', { name: 'Groove' }).click()
check('panel switches to "selected notes" scope', (await page.getByText('Acts on the selected notes').count()) === 1)
await page.getByLabel('Humanize timing').fill('100')
await page.getByRole('button', { name: 'Humanize', exact: true }).click()
const postScope = await lefts()
const changed = postScope.map((x, i) => x !== preScope[i])
check('only the selected note was humanized', (await count()) === preScope.length && changed.slice(1).every((c) => !c), JSON.stringify({ preScope, postScope }))
await page.getByRole('button', { name: 'Groove' }).click()

// ---- Q key + context-menu quantize
await page.locator('[data-testid="note-surface"]').focus()
await page.keyboard.press('Control+a')
await page.keyboard.press('q')
check('Q quantizes the selection from the keyboard', onGrid(await lefts()))

// ---- settings remembered
await page.getByRole('button', { name: 'Groove' }).click()
await page.getByLabel('Swing amount').fill('70')
await page.waitForTimeout(300)
await page.reload()
await page.getByRole('button', { name: 'Edit Root' }).click()
await page.getByRole('button', { name: 'Groove' }).click()
check('groove settings are remembered', (await page.getByLabel('Swing amount').inputValue()) === '70' && (await page.getByLabel('Humanize timing').inputValue()) === '100')
await page.keyboard.press('Escape')

// ---- same menu component on session clip slots
const slot = page.locator('button', { hasText: 'Walk' }).first().locator('xpath=..')
await slot.click({ button: 'right' })
const slotLabels = await page.getByRole('menuitem').allTextContents()
check('clip slots reuse the context menu', ['Launch clip', 'Edit notes', 'Delete clip'].every((l) => slotLabels.includes(l)), JSON.stringify(slotLabels))
await page.getByRole('menuitem', { name: 'Edit notes' }).click()
check('"Edit notes" opens the clip editor', (await page.getByText('Bass / Walk').count()) === 1)
await slot.click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Delete clip' }).click()
check('"Delete clip" empties the slot', (await page.locator('button', { hasText: 'Walk' }).count()) === 0)
const empty = page.getByRole('button', { name: 'Create clip' }).first().locator('xpath=..')
await empty.click({ button: 'right' })
check('empty slots offer "Create clip"', (await page.getByRole('menuitem', { name: 'Create clip' }).count()) === 1)
await page.keyboard.press('Escape')
await page.screenshot({ path: `${dir}/12-menu.png` })

console.log('page errors:', JSON.stringify(errors.filter((e) => !e.includes('Failed to load resource'))))
await browser.close()
