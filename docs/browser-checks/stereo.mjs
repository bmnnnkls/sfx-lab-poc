import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { LOOP_WINDOW_MS, installAudioTap, listen, show } from './audio-tap.mjs'
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

// Settings live in the property editor: select the node (click its header), then use its rows.
const properties = () => page.getByRole('complementary', { name: 'Properties' })
const selectNode = (title) => node(title).locator('[class*="nodeHeader"]').first().click()
const slider = (label) => properties().getByRole('slider', { name: label, exact: true })
const valueField = (label) => properties().getByRole('textbox', { name: `${label} value`, exact: true })

// Both channels of the real output, sample for sample (see audio-tap.mjs for why not two analysers).
await installAudioTap(page)
const surface = page.getByTestId('patch-surface')
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace('node-', '')
const wire = async (fromTitle, toTitle, fromPort = 'out', toPort = 'in') => {
  const a = await page.getByTestId(`out-${await idOf(fromTitle)}-${fromPort}`).boundingBox()
  const b = await page.getByTestId(`in-${await idOf(toTitle)}-${toPort}`).boundingBox()
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}`) })
const add = addNode
const LOOP = 'Demo Drum Loop 120 BPM'

await page.goto('http://localhost:4173/?starter')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()
await trackBtn('Audio').click()
await page.getByRole('button', { name: 'Effects', exact: true }).click()

// ---- untouched: the same in both channels
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
const plain = await listen(page, 1500)
check('a track without effects is the same in both channels', plain.peak[0] > 0.02 && plain.diffPeak < 1e-6, show(plain))

// ---- pan
await add('Pan')
await surface.locator('[data-testid^="wire-"]').first().click({ force: true }) // cut the direct wire
await wire('Track in', 'Pan')
await wire('Pan', 'Track out')
check('Track in (mono) -> Pan -> Track out (stereo) is wired', (await wireCount()) === 2, String(await wireCount()))
await selectNode('Pan')
await slider('Pan').fill('0') // hard left
await page.waitForTimeout(500)
const left = await listen(page, LOOP_WINDOW_MS)
check('panned hard left: sound only on the left', left.peak[0] > 0.02 && left.peak[1] < 0.001, show(left))
await slider('Pan').fill('1000') // hard right
await page.waitForTimeout(500)
const right = await listen(page, LOOP_WINDOW_MS)
check('panned hard right: sound only on the right', right.peak[1] > 0.02 && right.peak[0] < 0.001, show(right))
await page.screenshot({ path: `${dir}/stereo-pan.png` })

// ---- a mono node cannot take stereo until it is switched to stereo
await selectNode('Pan')
await slider('Pan').fill('250')
await add('Filter')
await wire('Pan', 'Filter')
check('a stereo output does not wire into a mono Filter', (await wireCount()) === 2, String(await wireCount()))
await selectNode('Filter')
await properties().getByRole('checkbox', { name: 'Stereo' }).check()
check('the Filter can be switched to stereo', (await node('Filter').locator('[class*="stereoTag"]').count()) === 1)
await wire('Pan', 'Filter')
check('and then the stereo wire is accepted', (await wireCount()) === 3, String(await wireCount()))
await properties().getByRole('checkbox', { name: 'Stereo' }).uncheck()
check('switching it back to mono drops the wire that no longer fits', (await wireCount()) === 2, String(await wireCount()))
await page.getByRole('button', { name: 'Remove Filter' }).click()
await page.getByRole('button', { name: 'Remove Pan' }).click()

// ---- stereo reverb widens a mono sample
await add('Stereo reverb')
await wire('Track in', 'Stereo reverb')
await wire('Stereo reverb', 'Track out')
await selectNode('Stereo reverb')
const mixKnob = slider('Mix')
await mixKnob.fill('1000')
await page.waitForTimeout(600)
const wet = await listen(page, LOOP_WINDOW_MS)
check('a stereo reverb on the mono loop gives both channels sound', wet.peak[0] > 0.01 && wet.peak[1] > 0.01, show(wet))
check('...and the two channels differ (an untouched mono track gives exactly equal ones)', wet.diffPeak > 1e-3, show(wet))
await page.screenshot({ path: `${dir}/stereo-reverb.png` })

// ---- persistence
await page.reload()
await trackBtn('Audio').click()
await page.getByRole('button', { name: 'Effects', exact: true }).click()
check('the stereo graph survives a reload', (await node('Stereo reverb').count()) === 1 && (await wireCount()) === 2)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
