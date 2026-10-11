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

const PPB = 56 // default zoom: pixels per beat; grid 1/8 = 0.5 beat = 28 px
const ROW = 16
const surface = () => page.getByTestId('note-surface')
const noteEls = () => page.locator('[data-note-id]')
const count = () => noteEls().count()
const at = async (beat, pitch) => {
  const box = await surface().boundingBox()
  return { x: box.x + beat * PPB, y: box.y + (127 - pitch) * ROW + ROW / 2 }
}
const drag = async (from, to, { shift = false } = {}) => {
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}
/** geometry of the note at a pitch, from the DOM */
const rectOf = async (pitch, nth = 0) => {
  const el = page.locator(`[data-pitch="${pitch}"]`).nth(nth)
  const box = await el.boundingBox()
  const s = await surface().boundingBox()
  return { left: Math.round(box.x - s.x), width: Math.round(box.width), top: Math.round(box.y - s.y) }
}

/** Click a note where it is on screen (Playwright's own auto-scroll can park it under the sticky ruler). */
const clickNote = async (locator, { shift = false, button = 'left' } = {}) => {
  const b = await locator.boundingBox()
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button })
  if (shift) await page.keyboard.up('Shift')
}
const undo = () => page.getByRole('button', { name: 'Undo' }).click()

await page.goto('http://localhost:4173/')
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sfxlab:editor-height', '720'); localStorage.setItem('sfxlab:roll-velocity', 'false') })
await page.reload()
await page.getByRole('button', { name: 'Edit Root' }).click()
const start = await count()
check('Root clip shows its 6 notes', start === 6, `count=${start}`)

// ---- draw: click-drag makes a longer note; plain click makes one grid step
await drag(await at(0.1, 48), await at(2.2, 48)) // cells 0..4  => 5 cells = 2.5 beats = 140 px
let r = await rectOf(48)
check('click-drag draws a long note', (await count()) === start + 1 && r.left === 0 && r.width === 139, JSON.stringify(r))
await page.mouse.click((await at(3, 50)).x, (await at(3, 50)).y)
r = await rectOf(50)
check('plain click draws one grid step', r.width === 27 && r.left === 168, JSON.stringify(r))

// ---- one gesture = one undo step
await undo()
check('undo removes just the click-note', (await count()) === start + 1 && (await page.locator('[data-pitch="50"]').count()) === 0)
await undo()
check('undo removes the dragged note', (await count()) === start)
await page.getByRole('button', { name: 'Redo' }).click()
await page.getByRole('button', { name: 'Redo' }).click()
check('redo brings both back', (await count()) === start + 2)

// ---- move: drag the body 1 beat right and 2 semitones up
const before = await rectOf(48)
await drag(await at(0.5, 48), await at(1.5, 50))
const moved = await rectOf(50, 0)
const stillThere = await page.locator('[data-pitch="48"]').count()
check('dragging the body moves in time and pitch (snapped)', stillThere === 0 && moved.left === before.left + 56 && moved.width === before.width, JSON.stringify({ before, moved }))

// ---- resize: right edge (clamped at clip end), then back, then left edge
const longNote = page.locator('[data-pitch="50"]').first()
const grab = async (part) => { const b = await longNote.locator(`[data-part="${part}"]`).boundingBox(); return { x: b.x + 3, y: b.y + 8 } }
const surfaceBox = await surface().boundingBox()
const w0 = (await longNote.boundingBox()).width
let h = await grab('end')
await drag(h, { x: h.x + 56, y: h.y })
const w1 = (await longNote.boundingBox()).width
check('dragging the right edge lengthens, stopping at the clip end', Math.round(w1 - w0) === 28, `${w0} -> ${w1}`)
const endX = (await longNote.boundingBox()).right ?? ((await longNote.boundingBox()).x + w1)
check('...exactly at the end of the clip', Math.abs(endX + 1 - (surfaceBox.x + 4 * PPB)) <= 1, `end=${endX + 1} clipEnd=${surfaceBox.x + 4 * PPB}`)
h = await grab('end')
await drag(h, { x: h.x - 84, y: h.y })
const w2 = (await longNote.boundingBox()).width
check('dragging the right edge back shortens', Math.round(w2 - w1) === -84, `${w1} -> ${w2}`)
const leftBefore = await rectOf(50)
h = await grab('start')
await drag({ x: h.x - 1, y: h.y }, { x: h.x - 1 + 28, y: h.y })
const leftAfter = await rectOf(50)
check('dragging the left edge moves the start, end stays', leftAfter.left === leftBefore.left + 28 && leftAfter.left + leftAfter.width === leftBefore.left + leftBefore.width, JSON.stringify({ leftBefore, leftAfter }))

// ---- multi-select + group move
await page.keyboard.press('Escape')
const a0 = await rectOf(50)
const b0 = await rectOf(36, 0)
await clickNote(page.locator('[data-pitch="36"]').first())
await clickNote(page.locator('[data-pitch="50"]').first(), { shift: true })
{
  const sel = await page.locator('[data-note-id][class*="selected"]').evaluateAll((els) => els.map((e) => `${e.dataset.pitch}@${Math.round(parseFloat(e.style.left))}`))
  const win = await page.evaluate(() => { const sc = document.querySelector('[class*="_scroller_"]'); const r = sc.getBoundingClientRect(); return { scrollTop: sc.scrollTop, top: r.top, h: r.height } })
  const b50 = await page.locator('[data-pitch="50"]').first().boundingBox()
  check('shift-click adds to the selection', sel.length === 2, `selected=${JSON.stringify(sel)} viewport=${JSON.stringify(win)} note50.y=${Math.round(b50.y)}`)
}
const grabB = await page.locator('[data-pitch="36"]').first().boundingBox()
await drag({ x: grabB.x + grabB.width / 2, y: grabB.y + 8 }, { x: grabB.x + grabB.width / 2 + 56, y: grabB.y + 8 })
const a1 = await rectOf(50)
const b1 = await rectOf(36, 0)
check('selected notes move together by the same amount', a1.left - a0.left === 56 && b1.left - b0.left === 56, JSON.stringify({ da: a1.left - a0.left, db: b1.left - b0.left }))

// ---- delete: key, right click, double click
await page.keyboard.press('Escape')
const c0 = await count()
await clickNote(page.locator('[data-pitch="50"]').first())
await page.keyboard.press('Delete')
check('Delete key removes the selection', (await count()) === c0 - 1)
await clickNote(page.locator('[data-pitch="43"]').first(), { button: 'right' })
check('right-click no longer deletes by itself (it opens the menu)', (await count()) === c0 - 1)
await page.getByRole('menuitem', { name: /^Delete/ }).click()
check('Delete in the right-click menu removes the note', (await count()) === c0 - 2)
const dbl = page.locator('[data-pitch="39"]').first()
const dblBox = await dbl.boundingBox()
await page.mouse.click(dblBox.x + dblBox.width / 2, dblBox.y + 8)
await page.mouse.click(dblBox.x + dblBox.width / 2, dblBox.y + 8)
check('double-click deletes a note', (await count()) === c0 - 3)
await clickNote(page.locator('[data-note-id]').first())
await page.keyboard.press('Control+a')
check('Ctrl+A selects every note', (await page.locator('[data-note-id][class*="selected"]').count()) === (await count()))
await page.keyboard.press('Escape')
const beforeDup = await count()
await page.waitForTimeout(450) // a second click on the same note inside 350 ms would count as a double-click
await clickNote(page.locator('[data-pitch="36"]').first())
await page.keyboard.press('Control+d')
check('Ctrl+D duplicates the selection right after itself', (await count()) === beforeDup + 1 && (await page.locator('[data-note-id][class*="selected"]').count()) === 1)
await page.screenshot({ path: `${dir}/09-roll.png` })

// ---- arrows nudge
const target = page.locator('[data-note-id][class*="selected"]').first()
const p0 = Number(await target.getAttribute('data-pitch'))
await page.keyboard.press('ArrowUp')
check('arrow keys nudge pitch', Number(await page.locator('[data-note-id][class*="selected"]').first().getAttribute('data-pitch')) === p0 + 1)
await page.keyboard.press('Shift+ArrowDown')
check('Shift+arrow nudges an octave', Number(await page.locator('[data-note-id][class*="selected"]').first().getAttribute('data-pitch')) === p0 + 1 - 12)

// ---- longer clips
const lengthInput = page.getByLabel('Clip length in beats')
const notesBefore = await count()
await lengthInput.fill('16')
await lengthInput.press('Enter')
await page.waitForTimeout(100)
const width16 = (await surface().boundingBox()).width
check('length field makes the clip longer (16 beats = 896 px)', Math.round(width16) === 16 * PPB, `width=${width16}`)
check('ruler shows 4 bars', (await page.locator('[class*="_ruler_"] span').count()) === 4)
check('lengthening keeps every note', (await count()) === notesBefore)
await page.getByText(/beats \(4 bars\)/).waitFor()

// draw a note out at bar 3 (needs horizontal scroll) by scrolling the container
await page.evaluate(() => { document.querySelector('[class*="_scroller_"]').scrollLeft = 900 })
const lateBox = await surface().boundingBox()
const lateX = lateBox.x + 11 * PPB
const lateY = lateBox.y + (127 - 41) * ROW + 8
await drag({ x: lateX, y: lateY }, { x: lateX + 3 * 28, y: lateY })
const late = await rectOf(41, (await page.locator('[data-pitch="41"]').count()) - 1)
check('can draw far down a long clip', late.left === 11 * PPB && late.width === 4 * 28 - 1, JSON.stringify(late))
await page.evaluate(() => { document.querySelector('[class*="_scroller_"]').scrollLeft = 0 })

// shorten trims, undo restores
const notesLong = await count()
await lengthInput.fill('2')
await lengthInput.press('Enter')
await page.waitForTimeout(100)
const afterShort = await count()
const allInside = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="note-surface"]').getBoundingClientRect()
  return [...document.querySelectorAll('[data-note-id]')].every((n) => n.getBoundingClientRect().right <= s.right + 1)
})
check('shortening trims notes that no longer fit', afterShort < notesLong && allInside, `${notesLong} -> ${afterShort}`)
await undo()
const settled = async (expected) => { const t0 = Date.now(); while (Date.now() - t0 < 1500) { if ((await lengthInput.inputValue()) === expected) return Date.now() - t0; await page.waitForTimeout(25) } return -1 }
const lag = await settled('16')
check('undo restores the trimmed notes and length', (await count()) === notesLong && lag >= 0, `field caught up after ${lag} ms`)

// double
await lengthInput.fill('4'); await lengthInput.press('Enter')
const nShort = await count()
await page.getByRole('button', { name: 'Double' }).click()
const lag2 = await settled('8')
check('Double repeats the content into the new half', lag2 >= 0 && (await count()) === nShort * 2, `${nShort} -> ${await count()}, field caught up after ${lag2} ms`)

// ---- zoom
const w = (await surface().boundingBox()).width
await page.getByLabel('Zoom').fill('112')
check('zoom slider scales the roll', Math.round((await surface().boundingBox()).width) === Math.round(w * 2))
await surface().hover()
await page.keyboard.down('Control')
await page.mouse.wheel(0, -200)
await page.keyboard.up('Control')
await page.waitForTimeout(100)
check('Ctrl+wheel zooms further', (await surface().boundingBox()).width > w * 2)

// ---- editing a SOUNDING clip must not leave notes stuck on
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(40) } return m }
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.getByRole('button', { name: /Cm/ }).first().click() // launch the pad chord (8 beats, sustained)
const playing = await level(1500)
check('pad chord is sounding', playing > 0.02, `peak=${playing.toFixed(3)}`)
await page.getByRole('button', { name: 'Edit Cm' }).click()
await surface().click({ position: { x: 5, y: 5 } }) // focus (draws a stray note; select all then delete everything)
await page.keyboard.press('Control+a')
await page.keyboard.press('Delete')
check('all notes deleted while playing', (await count()) === 0)
const afterDelete = await level(7000) // pad release is 1.2 s, delay tail a few seconds
const tail = await level(800)
check('the sounding notes are released (output falls to silence)', tail < 0.005, `peak during edit=${afterDelete.toFixed(3)}, 7 s later=${tail.toFixed(4)}`)

console.log('page errors:', JSON.stringify(errors.filter((e) => !e.includes('Failed to load resource'))))
await browser.close()
