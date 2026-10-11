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
const add = (name) => page.getByRole('button', { name, exact: true }).click()
const effects = () => page.getByRole('button', { name: 'Effects', exact: true }).click()
const LOOP = 'Demo Drum Loop 120 BPM'

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()

// ---- a return track
await page.getByRole('button', { name: 'Add track' }).click()
const entries = await page.getByRole('menuitem').allTextContents()
check('the + menu offers a return track', entries.includes('Return track'), JSON.stringify(entries))
await page.getByRole('menuitem', { name: 'Return track' }).click()
check('the return track appears, tagged, with no clips and no stop button', (await trackBtn('Return A').count()) === 1 && (await page.getByRole('button', { name: 'Stop Return A' }).count()) === 0)
check('it is shown after the clip tracks', (await page.locator('[class*="_trackName_"]').allTextContents()).at(-1)?.startsWith('Return A') === true)

await trackBtn('Return A').click()
await effects()
check('its Effects tab starts at Return in, wired to Track out', (await node('Return in').count()) === 1 && (await node('Track out').count()) === 1 && (await wireCount()) === 1)
check('its palette offers Return in and Send, but not Track in', (await page.getByRole('button', { name: 'Track in', exact: true }).count()) === 0 && (await page.getByRole('button', { name: 'Send', exact: true }).count()) === 1)
await page.getByRole('button', { name: 'Instrument', exact: true }).click()
check('the Instrument tab says a return has no instrument', (await page.getByText(/is a return track: it has no instrument/).count()) === 1)
await effects()

await surface.locator('[data-testid^="wire-"]').first().click({ force: true })
await add('Stereo reverb')
await wire('Return in', 'Stereo reverb')
await wire('Stereo reverb', 'Track out')
const knob = (n) => node('Stereo reverb').locator('input[type=range]').nth(n)
await knob(0).fill('1000') // size
await knob(3).fill('1000') // mix: all wet
check('Return in -> Stereo reverb -> Track out', (await wireCount()) === 2, String(await wireCount()))

// ---- send the audio track to it
await trackBtn('Audio').click()
await effects()
check('the audio track has its own Track in / Track out and no Return in in its palette', (await node('Track in').count()) === 1 && (await page.getByRole('button', { name: 'Return in', exact: true }).count()) === 0)
await add('Send')
const picker = surface.getByLabel('Send to return track')
const options = await picker.locator('option').allTextContents()
check('the Send offers the return tracks', options.includes('Return A') && !options.includes('Audio 4'), JSON.stringify(options))
await picker.selectOption({ label: 'Return A' })
await wire('Track in', 'Send')
check('Track in is wired to the Send as well as to Track out', (await wireCount()) === 2, String(await wireCount()))
await page.screenshot({ path: `${dir}/returns-send.png` })

// ---- hear it: dry track turned all the way down, so what is heard is the return
await page.getByLabel(/^Audio \d+ volume$/).fill('0')
check('silent before launching', (await level(300)) < 0.01)
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
const sent = await level(1500)
check('the track is turned down but its send still sounds through the return reverb', sent > 0.02, `peak=${sent.toFixed(3)}`)
await page.getByRole('button', { name: /^Stop Audio/ }).click()
await page.waitForTimeout(3500) // the stop waits for the end of the bar
const tail = await level(600)
check('the return reverb rings on after the clip has stopped', tail > 0.003, `peak=${tail.toFixed(4)}`)

// ---- remove the return: nothing crashes, the sound is gone; undo brings it back with the send
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: 'Remove Return A' }).click()
await page.waitForTimeout(800)
check('after removing the return the turned-down track is silent', (await level(1000)) < 0.005)
check('and the Send says there is no return to send to', (await picker.locator('option').allTextContents())[0]?.includes('no return track') === true, JSON.stringify(await picker.locator('option').allTextContents()))
await page.getByRole('button', { name: 'Undo' }).click()
await page.waitForTimeout(800)
check('undo brings back the return and the Send pointing at it', (await trackBtn('Return A').count()) === 1 && (await picker.inputValue()) !== '')
check('...and the sound', (await level(1500)) > 0.02)

// ---- loops between returns are refused
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Return track' }).click()
await trackBtn('Return A').click()
await effects()
await add('Send')
const pickerA = surface.getByLabel('Send to return track')
check('a return may send to another return', (await pickerA.locator('option').allTextContents()).includes('Return B'))
await pickerA.selectOption({ label: 'Return B' })
await trackBtn('Return B').click()
await effects()
await add('Send')
const optionsB = await surface.getByLabel('Send to return track').locator('option').allTextContents()
check('...but Return B cannot send back to Return A (a loop) or to itself', !optionsB.includes('Return A') && !optionsB.includes('Return B'), JSON.stringify(optionsB))

// ---- persistence
await page.reload()
await trackBtn('Audio').click()
await effects()
check('the Send and its return survive a reload', (await node('Send').count()) === 1 && (await surface.getByLabel('Send to return track').inputValue()) !== '')

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
