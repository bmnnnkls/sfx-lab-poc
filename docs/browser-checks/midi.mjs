// MIDI input with a fake Web MIDI device (the page gets a stand-in `navigator.requestMIDIAccess`): the MIDI switch, keys
// playing the selected track (held as long as the key, released on note-off), the status line, MIDI learn on a panel knob
// (a controller then moves it, and the real sound follows), forgetting, and the binding surviving a reload.
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(existsSync('/node-tools/node_modules/') ? '/node-tools/node_modules/' : '/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
await context.addInitScript(() => {
  const input = { name: 'Fake Keys', state: 'connected', onmidimessage: null }
  const access = { inputs: new Map([['fake', input]]), outputs: new Map(), onstatechange: null }
  navigator.requestMIDIAccess = async () => access
  window.__midi = (...bytes) => input.onmidimessage?.({ data: new Uint8Array(bytes) })
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)

const midi = (...bytes) => page.evaluate((b) => window.__midi(...b), bytes)
const level = async (ms) => {
  let peak = 0
  const end = Date.now() + ms
  while (Date.now() < end) {
    peak = Math.max(peak, Number(await page.locator('[data-peak]').first().getAttribute('data-peak')))
    await page.waitForTimeout(40)
  }
  return peak
}
const track = (name) => page.locator('[class*="_trackName_"]', { hasText: name }).first().click()
const tab = (name) => page.getByRole('button', { name, exact: true }).first().click()
const status = () => page.getByTestId('midi-status').innerText()

await page.goto('http://localhost:4173/?starter')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

// ---- the switch
const off = page.getByRole('button', { name: /^MIDI off/ })
check('MIDI starts off, as a button', (await off.count()) === 1)
await off.click()
await page.getByTestId('midi-status').waitFor({ timeout: 3000 })
check('a click turns it on and shows the device', /1 device/.test(await status()), await status())
check('its tooltip says where the keys play', /Keys play:/.test(await page.locator('[data-midi="on"]').getAttribute('title')))

// ---- keys play the selected track
await track('Bass')
check('silence before a key', (await level(600)) < 0.01)
await midi(0x90, 48, 110)
check('a key plays the selected track, transport stopped', (await level(800)) > 0.02)
check('the status line shows the note', /Note C3 on ch 1/.test(await status()), await status())
check('held: still sounding after a second and a half', (await level(1500)) > 0.02)
await midi(0x80, 48, 0)
await page.waitForTimeout(9000)
check('note-off lets it go', (await level(800)) < 0.01)
await page.screenshot({ path: `${dir}/midi-status.png` })

// ---- learn a knob on the panel
const view = (name) => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }).click()
const form = () => page.getByRole('form', { name: 'Add a control' })
await tab('Instrument')
await view('Panel')
await page.getByRole('button', { name: 'Edit panel' }).click()
await form().getByLabel('Control type').selectOption('knob')
await form().getByLabel('Parameter', { exact: true }).selectOption({ label: 'Gain: Gain' })
await form().getByRole('button', { name: 'Add' }).click()
const knob = page.getByRole('slider', { name: 'Gain', exact: true })
const knobCell = page.locator('[data-testid^="control-"]').filter({ has: knob })
const learn = page.getByRole('button', { name: /^Learn MIDI for / }).last()
check('edit mode offers MIDI learn on a knob', (await learn.count()) === 1)
await learn.click()
check('learning: the control is marked and the status line asks for a controller', (await knobCell.getAttribute('data-learning')) === 'true' && /Move a controller/.test(await status()))
await midi(0xb0, 21, 127)
await page.waitForTimeout(150)
const learnText = await page.getByRole('button', { name: /^Learn MIDI for / }).last().innerText()
check('the next controller is bound to it', learnText === 'CC 21' && (await knobCell.getAttribute('data-learning')) === null, `${learnText} ${await knobCell.getAttribute('data-learning')}`)
const valueOf = async () => Number(await knob.getAttribute('data-position'))
await midi(0xb0, 21, 0)
await page.waitForTimeout(150)
check('CC 21 at 0 turns the knob to its minimum', (await valueOf()) === 0, String(await valueOf()))
await midi(0x90, 48, 110)
check('and the real sound follows: the Gain at 0 silences the key', (await level(800)) < 0.01)
await midi(0xb0, 21, 127)
check('CC 21 at 127 brings it back', (await level(800)) > 0.02)
await midi(0x80, 48, 0)
await midi(0xb0, 22, 0)
await page.waitForTimeout(150)
check('another controller leaves it alone', (await valueOf()) > 0)
await page.getByRole('button', { name: 'Done' }).click()
check('in play mode a bound control shows its controller', (await knobCell.getByText('CC 21', { exact: true }).count()) === 1)
await page.screenshot({ path: `${dir}/midi-learned.png` })

// ---- one undo step for a stream of controller moves
for (let value = 0; value <= 127; value += 16) await midi(0xb0, 21, value)
await page.waitForTimeout(150)
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
check('a stream from one controller is one undo step: undo goes back to before it (127)', (await valueOf()) === 1, String(await valueOf()))

// ---- survives a reload, and can be forgotten
await page.waitForTimeout(800)
await page.reload()
await page.locator('[data-midi]').first().waitFor()
await page.waitForTimeout(500)
check('MIDI comes back on by itself after a reload', (await page.getByTestId('midi-status').count()) === 1)
await track('Bass')
await tab('Instrument')
await view('Panel')
check('the binding was saved', (await page.getByText('CC 21', { exact: true }).count()) === 1)
await page.getByRole('button', { name: 'Edit panel' }).click()
await page.getByRole('button', { name: /^Forget MIDI for / }).last().click()
check('Forget removes it', (await page.getByRole('button', { name: /^Learn MIDI for / }).last().innerText()) === 'MIDI')

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
