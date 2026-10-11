import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(existsSync('/node-tools/node_modules/') ? '/node-tools/node_modules/' : '/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1700, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)

const surface = page.getByTestId('patch-surface')
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace(/^node-/, '')
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const selectNode = (title) => node(title).locator('[class*="nodeHeader"]').first().click()
const valueField = (label) => properties().getByRole('textbox', { name: `${label} value`, exact: true })
const counts = async () => { const [a, b] = (await page.getByTestId('heard-count').innerText()).match(/\d+/g).map(Number); return { input: a, output: b } }
const popup = () => page.getByTestId('quick-add')
const optionLabels = async () => popup().getByRole('option').evaluateAll((els) => els.map((el) => el.dataset.label))
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()
const wire = async (fromTitle, toTitle, fromPort = 'out', toPort = 'in') => {
  const a = await page.getByTestId(`out-${await idOf(fromTitle)}-${fromPort}`).boundingBox()
  const b = await page.getByTestId(`in-${await idOf(toTitle)}-${toPort}`).boundingBox()
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await page.getByRole('button', { name: 'Notes', exact: true }).click()
const base = await counts()
check('the default note graph hears the clip as written', base.input === base.output && base.input > 0, JSON.stringify(base))

// ---- a wire dropped on empty canvas asks what should take it
const view = await page.locator('[class*="scroller"]').first().boundingBox()
const out = await page.getByTestId(`out-${await idOf('Clip notes')}-out`).boundingBox()
const drop = { x: view.x + 120, y: view.y + 150 }
await page.mouse.move(out.x + out.width - 4, out.y + out.height / 2)
await page.mouse.down()
await page.mouse.move(drop.x, drop.y, { steps: 8 })
await page.mouse.up()
check('dropping a wire on empty canvas opens the picker', (await popup().count()) === 1)
check('which says what it is for', /Can take Clip notes Out/.test(await popup().innerText()), (await popup().innerText()).split('\n').slice(0, 3).join(' | '))
const labels = await optionLabels()
check('and lists the categories that can take notes', labels.includes('Effects') && labels.includes('Routing') && !labels.includes('Math') && !labels.includes('Controls'), labels.join(','))
await page.getByRole('combobox', { name: 'Add a node' }).fill('')
await page.keyboard.type('trans')
check('searching offers only what fits: Transpose, not a sound node or a control', (await optionLabels())[0] === 'Transpose' && !(await optionLabels()).includes('Control'), (await optionLabels()).join(','))
const wiresBefore = await wireCount()
await page.keyboard.press('Enter')
check('picking it adds the node and wires it to the wire that was dragged', (await node('Transpose').count()) === 1 && (await wireCount()) === wiresBefore + 1)
check('and selects it', (await node('Transpose').getAttribute('data-selected')) === 'true')
const placed = await node('Transpose').boundingBox()
check('it is placed at the drop, to the right of the pointer', placed.x >= drop.x - 5 && placed.x < drop.x + 60, JSON.stringify([placed, drop]))
await page.screenshot({ path: `${dir}/notecontrols-drop.png` })

// a drop with nothing fitting: Esc closes without adding
await page.mouse.move(out.x + out.width - 4, out.y + out.height / 2)
await page.mouse.down()
await page.mouse.move(drop.x + 300, drop.y + 100, { steps: 6 })
await page.mouse.up()
await page.keyboard.press('Escape')
check('Escape after a dropped wire adds nothing', (await popup().count()) === 0 && (await wireCount()) === wiresBefore + 1)

// ---- Transpose -> instrument: now a split, with the transposed copy at 0 semitones the same notes (merged)
await wire('Transpose', 'To instrument')
check('Clip notes -> Transpose -> To instrument beside the direct wire', (await wireCount()) === 3, String(await wireCount()))
const same = await counts()
check('at 0 semitones the copy is the same notes, so nothing is added', same.output === base.output, JSON.stringify(same))

// ---- note nodes have sockets: create a knob for Semitones
await page.getByRole('checkbox', { name: 'Sockets' }).check()
await (await page.getByTestId(`in-${await idOf('Transpose')}-param:semitones`)).click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Create knob' }).click()
check('Create knob on a note node\'s socket adds a control to the note graph, wired', (await node('Semitones').count()) === 1 && (await wireCount()) === 4)
await selectNode('Semitones')
check('named after the parameter, with its range and unit', (await valueField('Min').inputValue()) === '-24' && (await valueField('Max').inputValue()) === '24')
await valueField('Value').fill('12')
await page.waitForTimeout(500)
const octave = await counts()
check('the control drives the Transpose: at +12 the copy is an octave up, so every note is heard twice', octave.output === base.output * 2, JSON.stringify(octave))
await valueField('Value').fill('0')
await page.waitForTimeout(400)
check('and back to 0 it merges again, with no hanging notes', (await counts()).output === base.output)
await page.screenshot({ path: `${dir}/notecontrols-control.png` })

// ---- math in a note graph: a control through Add (a + b) into the socket
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.getByRole('combobox', { name: 'Add a node' }).fill('Add')
check('the note graph\'s picker offers math', (await optionLabels()).includes('Add'))
await page.keyboard.press('Escape')

// ---- panel view of a note graph shows the control
await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Panel', exact: true }).click()
check('the note graph\'s panel shows the control as a knob', (await page.getByRole('slider', { name: 'Semitones', exact: true }).count()) === 1)
await page.getByRole('slider', { name: 'Semitones', exact: true }).focus()
await page.keyboard.press('End')
await page.waitForTimeout(500)
check('turning it there drives the notes too (+24 is two octaves up)', (await counts()).output === base.output * 2)
await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Graph', exact: true }).click()

// ---- persistence
await page.waitForTimeout(1200)
await page.reload()
await page.getByRole('button', { name: 'Notes', exact: true }).click()
check('the control and its wire survive a reload', (await node('Semitones').count()) === 1 && (await wireCount()) === 4)
check('and still drive the notes', (await counts()).output === base.output * 2)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
