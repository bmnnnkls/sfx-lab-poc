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
const bar = page.getByRole('group', { name: 'Randomize' })
const seedField = () => bar.getByRole('spinbutton', { name: 'Seed' })
const roll = async (seed, button) => { await seedField().fill(String(seed)); await bar.getByRole('button', { name: button, exact: true }).click() }
const cutoff = async () => { await selectNode('Filter'); return Number(await valueField('Cutoff').inputValue()) }
const detune = async () => { await selectNode('Oscillator'); return Number(await valueField('Detune').inputValue()) }

const base = { cutoff: await cutoff(), detune: await detune() }
check('the toolbar has Randomize and Mutate and a seed', (await bar.getByRole('button').count()) === 2 && (await seedField().count()) === 1)

// ---- a full roll: same seed, same sound; another seed, another
await roll(42, 'Randomize')
const first = { cutoff: await cutoff(), detune: await detune() }
check('Randomize changes the settings', first.cutoff !== base.cutoff && first.detune !== base.detune, JSON.stringify([base, first]))
check('and says which seed it used', (await bar.innerText()).includes('last 42'))
await page.getByRole('button', { name: 'Undo' }).click()
const undone = { cutoff: await cutoff(), detune: await detune() }
check('one undo puts every setting back', undone.cutoff === base.cutoff && undone.detune === base.detune, JSON.stringify(undone))
await roll(42, 'Randomize')
const again = { cutoff: await cutoff(), detune: await detune() }
check('the same seed from the same start gives the same result', again.cutoff === first.cutoff && again.detune === first.detune, JSON.stringify(again))
await page.getByRole('button', { name: 'Undo' }).click()
await roll(43, 'Randomize')
check('another seed gives another', (await cutoff()) !== first.cutoff)
await page.getByRole('button', { name: 'Undo' }).click()

// ---- the seed moves on by itself after a press, so a second press is a new roll
const afterPress = await seedField().inputValue()
check('after a press the seed field has moved on (and is a number in range)', afterPress !== '43' && Number(afterPress) >= 0 && Number(afterPress) <= 9999, afterPress)

// ---- a locked node keeps its settings
await selectNode('Filter')
await properties().getByRole('checkbox', { name: 'Keep when randomizing' }).check()
await roll(7, 'Randomize')
check('a locked Filter keeps its cutoff while the rest changes', (await cutoff()) === base.cutoff && (await detune()) !== base.detune)
await page.getByRole('button', { name: 'Undo' }).click()

// ---- a mutation stays near: the cutoff, on its log scale, within a factor of about 1.5 for "a touch"
await selectNode('Filter')
await properties().getByRole('checkbox', { name: 'Keep when randomizing' }).uncheck()
await bar.getByLabel('Mutate by').selectOption({ label: 'a touch' })
await roll(5, 'Mutate')
const nudged = await cutoff()
check('Mutate by a touch keeps the cutoff near', nudged / base.cutoff > 0.65 && nudged / base.cutoff < 1.55, `${base.cutoff} -> ${nudged}`)
await page.getByRole('button', { name: 'Undo' }).click()
await page.screenshot({ path: `${dir}/randomize.png` })

// ---- the lock survives a reload
await selectNode('Filter')
await properties().getByRole('checkbox', { name: 'Keep when randomizing' }).check()
await page.waitForTimeout(1200)
await page.reload()
await track('Bass')
await selectNode('Filter')
check('the lock survives a reload', await properties().getByRole('checkbox', { name: 'Keep when randomizing' }).isChecked())
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
