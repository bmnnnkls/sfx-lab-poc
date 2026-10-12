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

// Settings live in the property editor: select the node (click its header), then use its rows.
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const selectNode = (title) => node(title).locator('[class*="nodeHeader"]').first().click()
const slider = (label) => properties().getByRole('slider', { name: label, exact: true })
const valueField = (label) => properties().getByRole('textbox', { name: `${label} value`, exact: true })
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
const surface = page.getByTestId('patch-surface')
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace('node-', '')
const counts = async () => { const [a, b] = (await page.getByTestId('heard-count').innerText()).match(/\d+/g).map(Number); return { input: a, output: b } }
const header = (title) => node(title).locator('[class*="nodeHeader"]')
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}`) })
const wire = async (fromTitle, toTitle, fromPort = 'out', toPort = 'in') => {
  const a = await page.getByTestId(`out-${await idOf(fromTitle)}-${fromPort}`).boundingBox()
  const b = await page.getByTestId(`in-${await idOf(toTitle)}-${toPort}`).boundingBox()
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()

await page.goto('http://localhost:4173/?starter')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await page.getByRole('button', { name: 'Notes', exact: true }).click()

check('the default graph is clip notes wired to the instrument', (await node('Clip notes').count()) === 1 && (await node('To instrument').count()) === 1 && (await wireCount()) === 1)
const base = await counts()
check('so the instrument hears the clip as written', base.input === base.output && base.input > 0, JSON.stringify(base))

// ---- split: add a transpose on a second branch
await addNode('Transpose')
await wire('Clip notes', 'Transpose')
await wire('Transpose', 'To instrument')
check('wiring made a second branch (3 wires)', (await wireCount()) === 3, String(await wireCount()))
const same = await counts()
check('an unchanged copy of the same notes at the same time is one note, not two', same.output === base.output, JSON.stringify(same))
await selectNode('Transpose')
await slider('Semitones').fill('750') // about +12
const split = await counts()
check('transposing the copy gives both: the original and a copy an octave up', split.output === base.output * 2, JSON.stringify(split))
await page.screenshot({ path: `${dir}/23-note-split.png` })

// ---- bypass
await properties().getByRole('checkbox', { name: 'Bypass' }).check()
check('bypassing the branch makes it a plain copy again', (await counts()).output === base.output)
await properties().getByRole('checkbox', { name: 'Bypass' }).uncheck()
check('and enabling brings the octave back', (await counts()).output === base.output * 2)

// ---- ports of other kinds do not accept the wire
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
check('the Instrument tab offers sound nodes, not note nodes', (await offers('Oscillator')) === true && (await offers('Range split')) === false)
await page.getByRole('button', { name: 'Notes', exact: true }).click()
check('the Notes tab offers note nodes, not sound nodes', (await offers('Range split')) === true && (await offers('Oscillator')) === false)

// ---- notes from another track
await addNode('Track notes')
const picker = properties().getByLabel('Take notes from track')
const options = await picker.locator('option').allTextContents()
check('the track picker offers the other instrument tracks, not this one', options.includes('Lead') && options.includes('Pad') && !options.includes('Bass'), JSON.stringify(options))
await picker.selectOption({ label: 'Lead' })
await wire('Track notes', 'To instrument')
check('the Track notes node is wired in', (await wireCount()) === 4, String(await wireCount()))
check('the preview says other tracks\' notes are not shown', (await page.getByText(/Notes from other tracks are not shown/).count()) === 1)
check('the track header shows the effect count (transpose + track notes)', (await page.getByLabel('Bass has 2 note effects').count()) === 1)

// ---- Lead cannot read from Bass (that would be a loop)
await trackBtn('Lead').click()
await page.getByRole('button', { name: 'Notes', exact: true }).click()
await addNode('Track notes')
const leadOptions = await properties().getByLabel('Take notes from track').locator('option').allTextContents()
check('Lead is not offered Bass, which already takes notes from Lead', !leadOptions.includes('Bass') && leadOptions.includes('Pad'), JSON.stringify(leadOptions))

// ---- play it: Bass hears Lead's notes through its own instrument
await trackBtn('Bass').click()
await page.getByRole('button', { name: 'Clip', exact: true }).click()
await page.locator('[class*="_launch_"]').nth(1).click() // Lead's first clip
const heard = await level(3500)
check('launching only the Lead plays through the engine with the cross-track tap', heard > 0.02, heard.toFixed(3))
await page.getByRole('button', { name: 'Stop Lead' }).click()
await page.waitForTimeout(9000)
check('and everything goes quiet afterwards', (await level(1200)) < 0.003)

// ---- module of notes, and it only shows where it fits
await trackBtn('Bass').click()
await page.getByRole('button', { name: 'Notes', exact: true }).click()
await header('Transpose').click()
await page.getByRole('button', { name: /^Group into module \(1\)/ }).click()
check('the transpose became a module', (await node('Module 1').count()) === 1 && (await node('Transpose').count()) === 0)
check('the module keeps its note ports (the graph is still wired)', (await wireCount()) === 4, String(await wireCount()))
check('the module is offered in the Notes tab', (await offers('Module 1')) === true)
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
check('but not among the Instrument tab\'s sound nodes', (await offers('Module 1')) === false)
await page.getByRole('button', { name: 'Notes', exact: true }).click()
await node('Module 1').getByRole('button', { name: 'Edit' }).click()
check('editing it opens the note nodes inside', (await node('Transpose').count()) === 1)
await page.getByLabel('Patch location').getByRole('button', { name: 'Bass notes' }).click()

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await page.getByRole('button', { name: 'Notes', exact: true }).click()
check('the graph survives a reload', (await node('Module 1').count()) === 1 && (await node('Track notes').count()) === 1 && (await wireCount()) === 4)
await selectNode('Track notes')
check('with the chosen track', (await properties().getByLabel('Take notes from track').inputValue()) !== '')

// ---- removing the tapped track clears the reference
await page.locator('[class*="_trackName_"]').filter({ hasText: /^Lead/ }).locator('xpath=ancestor::div[contains(@class,"header")]').getByRole('button', { name: /^Remove Lead/ }).click()
await page.waitForTimeout(300)
check('removing the Lead empties the picker instead of leaving a stale choice', (await properties().getByLabel('Take notes from track').inputValue()) === '')
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
