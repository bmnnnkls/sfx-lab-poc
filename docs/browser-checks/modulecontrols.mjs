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

const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
const surface = page.getByTestId('patch-surface')
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace(/^node-/, '')
const header = (title) => node(title).locator('[class*="nodeHeader"]').first()
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const crumb = (name) => page.getByLabel('Patch location').getByRole('button', { name, exact: true })
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}$`) })
const view = (name) => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }).click()
const addNode = async (label) => { await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.getByRole('combobox', { name: 'Add a node' }).fill(label); await page.locator(`[role=option][data-label="${label}"]`).first().click() }
const sockets = () => page.getByRole('checkbox', { name: 'Sockets' })
const knob = (name) => page.getByRole('slider', { name, exact: true })
const position = async (name) => Number(await knob(name).getAttribute('data-position'))
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await trackBtn('Bass').click()
await page.getByRole('separator', { name: 'Resize editor' }).focus()
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp')

// ---- a module with a control inside it
await header('Oscillator').click()
await header('Filter').click({ modifiers: ['Shift'] })
await page.getByRole('button', { name: /Group into module \(2\)/ }).click()
await node('Module 1').getByRole('button', { name: 'Edit' }).click()
await page.getByLabel('Module name').fill('Voice core')
await sockets().check()
await (await page.getByTestId(`in-${await idOf('Filter')}-param:cutoff`)).click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Create knob' }).click()
check('inside the module there is now a Cutoff control', (await node('Cutoff').count()) === 1)
check('and the module\'s interface says it will be on the panel of the graph that uses it', /On the panel of the graph that uses it: Cutoff/.test(await page.getByTestId('module-controls').innerText()), await page.getByTestId('module-controls').innerText())
await page.screenshot({ path: `${dir}/modulecontrols-inside.png` })
await crumb('Bass').click()
check('back out the use is called Voice core', (await node('Voice core').count()) === 1)

// ---- on the parent's panel, under the module's name
await view('Panel')
check('the control is on the panel of the graph that uses the module, named after the module', (await knob('Voice core: Cutoff').count()) === 1)
const dflt = await position('Voice core: Cutoff')
check('it starts at the module\'s own value (700 Hz on this scale)', dflt > 0.4 && dflt < 0.8, String(dflt))
await page.screenshot({ path: `${dir}/modulecontrols-panel.png` })

// ---- turning it sets this use's value, and the real sound follows
await page.locator('[class*="_launch_"]').first().click()
await page.waitForTimeout(1500)
const loud = await level(1500)
check('the bass plays through the module', loud > 0.02, loud.toFixed(3))
await knob('Voice core: Cutoff').focus()
await page.keyboard.press('Home')
await page.waitForTimeout(1800)
const dark = await level(1200)
check('turning the knob to its lowest darkens the sound (the filter is inside the module)', dark < loud * 0.3, `${dark.toFixed(3)} vs ${loud.toFixed(3)}`)
await page.keyboard.press('End')
await page.waitForTimeout(1500)
check('and back up brings it back', (await level(1500)) > loud * 0.5)
await page.keyboard.press('Home')
await page.locator('[class*="_launch_"]').first().click().catch(() => {})
await page.getByRole('button', { name: /^Stop/ }).first().click().catch(() => {})

// ---- edit mode: the tools belong to the module
await page.getByRole('button', { name: 'Edit panel' }).click()
check('in edit mode a module control says where it lives and has no move / size tools', (await page.getByText('in a module').count()) === 1 && (await page.getByRole('button', { name: /^Resize Voice core/ }).count()) === 0)
await page.getByRole('button', { name: 'Done' }).click()

// ---- the property editor of the use
await view('Graph')
await header('Voice core').click()
check('the use\'s property editor has a row for the control inside, with its own value', (await properties().getByRole('slider', { name: 'Cutoff', exact: true }).count()) === 1 && (await properties().getByRole('textbox', { name: 'Cutoff value', exact: true }).inputValue()) === '20')

// ---- a second use keeps its own value
await trackBtn('Lead').click()
await addNode('Voice core')
await view('Panel')
check('another use of the module has the same knob', (await knob('Voice core: Cutoff').count()) === 1)
const leadPosition = await position('Voice core: Cutoff')
check('at the module\'s value, not the Bass\'s (which is turned down)', leadPosition > 0.4, String(leadPosition))
await trackBtn('Bass').click()
check('and the Bass keeps its own', (await position('Voice core: Cutoff')) === 0)

// ---- a parameter socket exposed as a module input
await view('Graph')
await node('Voice core').getByRole('button', { name: 'Edit' }).click()
await page.getByTestId(`expose-in-${await idOf('Filter')}-param:resonance`).check()
await crumb('Bass').click()
const useId = await idOf('Voice core')
check('the exposed socket is an input on the module card', (await page.getByTestId(`in-${useId}-${await (async () => { await node('Voice core').getByRole('button', { name: 'Edit' }).click(); const id = await idOf('Filter'); await crumb('Bass').click(); return id })()}:param:resonance`).count()) === 1)
await addNode('Control')
const filterId = await (async () => { await node('Voice core').getByRole('button', { name: 'Edit' }).click(); const id = await idOf('Filter'); await crumb('Bass').click(); return id })()
const wiresBefore = await wireCount()
const out = await page.getByTestId(`out-${await idOf('Control')}-out`).boundingBox()
const input = await page.getByTestId(`in-${useId}-${filterId}:param:resonance`).boundingBox()
await page.mouse.move(out.x + out.width - 4, out.y + out.height / 2)
await page.mouse.down()
await page.mouse.move(input.x + 6, input.y + input.height / 2, { steps: 8 })
await page.mouse.up()
check('a control from the parent can be wired into it', (await wireCount()) === wiresBefore + 1)

// ---- hiding the control inside takes it off every panel that uses the module
await node('Voice core').getByRole('button', { name: 'Edit' }).click()
await header('Cutoff').click()
await properties().getByRole('checkbox', { name: 'Show on panel' }).uncheck()
await crumb('Bass').click()
await view('Panel')
check('hidden inside the module, it is gone from the Bass\'s panel', (await knob('Voice core: Cutoff').count()) === 0)
await trackBtn('Lead').click()
check('and from the Lead\'s', (await knob('Voice core: Cutoff').count()) === 0)

// ---- persistence
await page.waitForTimeout(1500)
await page.reload()
await trackBtn('Bass').click()
check('after a reload the module, its control and the hidden state survive', (await page.getByTestId('front-panel').count()) === 1 && (await knob('Voice core: Cutoff').count()) === 0)
await view('Graph')
await node('Voice core').getByRole('button', { name: 'Edit' }).click()
check('the Cutoff control is still inside, hidden from the panel', (await node('Cutoff').count()) === 1)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
