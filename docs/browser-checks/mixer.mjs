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

// Both channels of the real output, sample for sample (see audio-tap.mjs for why not two analysers).
await installAudioTap(page)
/** The largest raw peak a strip's own meter reported over a window. */
const meter = async (label, ms = 700) => {
  let best = 0
  const end = Date.now() + ms
  while (Date.now() < end) {
    best = Math.max(best, Number(await page.getByRole('meter', { name: label, exact: true }).getAttribute('data-peak')))
    await page.waitForTimeout(30)
  }
  return best
}
const control = (name) => page.getByLabel(name, { exact: true })
const pressed = async (name) => (await control(name).getAttribute('aria-pressed')) === 'true'
const mixer = () => page.getByRole('button', { name: 'Mixer', exact: true }).click()
const LOOP = 'Demo Drum Loop 120 BPM'
/** The launch button of the n-th clip (the "Edit <clip>" buttons also contain the name). */
const launch = (n) => page.getByRole('button', { name: new RegExp(`^[▶■]\\s*${LOOP}`) }).nth(n)

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

// ---- set up: two audio tracks with the drum loop, one return
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: 'Add track' }).click()
  await page.getByRole('menuitem', { name: 'Audio track' }).click()
  await page.getByRole('button', { name: 'Add audio clip' }).first().click()
  await page.getByRole('menuitem', { name: LOOP }).click()
}
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Return track' }).click()
await mixer()
await page.screenshot({ path: `${dir}/mixer.png` })

// ---- strips in the order the sound flows
const strips = await page.locator('section[aria-label$=" channel"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label').replace(/ channel$/, '')))
const names = (await page.locator('[class*="_trackName_"]').allTextContents()).map((text) => text.replace(/ (audio|return)$/, ''))
check('a strip for every track, the returns after them, the master last', strips.length === names.length && strips.at(-1) === 'Master' && strips.at(-2) === 'Return A' && strips.slice(-4, -2).join() === 'Audio 4,Audio 5', strips.join(', '))
check('in the same order as the session grid (tracks, returns, master)', JSON.stringify(strips) === JSON.stringify(names), `${names.join(', ')}`)
check('every strip has pan, mute, solo, a fader and a meter', (await control('Audio 4 pan').count()) === 1 && (await control('Audio 4 mute').count()) === 1 && (await control('Audio 4 solo').count()) === 1 && (await control('Audio 4 fader').count()) === 1 && (await page.getByRole('meter', { name: 'Audio 4 level', exact: true }).count()) === 1)
check('the return has no send knobs; the others have one per return, named after it', (await page.getByRole('group', { name: 'Return A sends' }).count()) === 0 && (await control('Audio 4 send to Return A').count()) === 1)
check('the master has a fader and a meter', (await control('Master fader').count()) === 1 && (await page.getByRole('meter', { name: 'Master level', exact: true }).count()) === 1)
check('the session-view headers keep the volume slider but have no send knobs and no mute', (await control('Audio 4 volume').count()) === 1 && (await page.locator('[class*="_header_"]').getByLabel(/ send to /).count()) === 0)

// ---- play Audio 4 alone: its meter moves, the others do not
await launch(0).click()
await page.waitForTimeout(800)
const level4 = await meter('Audio 4 level')
const level5 = await meter('Audio 5 level')
check('a playing track\'s meter moves and the others\' stay at zero', level4 > 0.02 && level5 === 0, `4=${level4.toFixed(3)} 5=${level5.toFixed(3)}`)
const master = await meter('Master level')
check('the master meter follows the output', master > 0.02, master.toFixed(3))

// ---- fader: the output's peak over a whole loop, before and after (the master soft-clips, and each pass of the loop peaks a few % differently, so only a band)
const atFull = await listen(page, LOOP_WINDOW_MS)
await control('Audio 4 fader').fill('0.4')
await page.waitForTimeout(1000)
const atHalf = await listen(page, LOOP_WINDOW_MS)
const ratio = atHalf.peak[0] / atFull.peak[0]
check('the fader changes the track\'s level (here from 0.8 to 0.4: about half)', atFull.peak[0] > 0.02 && ratio > 0.4 && ratio < 0.7, `${atFull.peak[0].toFixed(3)} -> ${atHalf.peak[0].toFixed(3)} (x${ratio.toFixed(3)})`)
check('the header slider shows the same volume', (await control('Audio 4 volume').inputValue()) === '0.4')
await control('Audio 4 fader').fill('0.8')

// ---- pan, per output channel
await page.waitForTimeout(800)
const centre = await listen(page, LOOP_WINDOW_MS)
check('centred: both channels carry the same sound', centre.peak[0] > 0.01 && centre.diffPeak < 1e-6, show(centre))
await control('Audio 4 pan').fill('-1')
await page.waitForTimeout(800)
const left = await listen(page, LOOP_WINDOW_MS)
check('panned hard left: sound in the left channel only', left.peak[0] > 0.9 * centre.peak[0] && left.peak[1] < 0.002, show(left))
await control('Audio 4 pan').fill('1')
await page.waitForTimeout(800)
const right = await listen(page, LOOP_WINDOW_MS)
check('panned hard right: sound in the right channel only', right.peak[1] > 0.9 * centre.peak[1] && right.peak[0] < 0.002, show(right))
await control('Audio 4 pan').dblclick()
const panAfter = await control('Audio 4 pan').inputValue()
await page.waitForTimeout(1500)
const back = await listen(page, LOOP_WINDOW_MS)
check('double-clicking the pan centres it again (value ' + panAfter + ')', back.peak[0] > 0.01 && back.diffPeak < 1e-6, show(back))

// ---- mute
await control('Audio 4 mute').click()
await page.waitForTimeout(1000)
const muted = await listen(page, 700)
check('muting the only playing track silences the output', muted.peak[0] < 0.002 && muted.peak[1] < 0.002, show(muted))
check('...and its meter reads zero, and the button shows it is pressed', (await meter('Audio 4 level')) === 0 && (await pressed('Audio 4 mute')))
await control('Audio 4 mute').click()
await page.waitForTimeout(1000)
const unmuted = await listen(page, LOOP_WINDOW_MS)
check('unmuting brings it back', unmuted.peak[0] > 0.01, show(unmuted))

// ---- solo: Audio 5 plays too; soloing Audio 4 silences it, and the return Audio 4 feeds stays heard
await launch(1).click()
await page.waitForTimeout(800)
check('both tracks have a level before solo', (await meter('Audio 4 level')) > 0.02 && (await meter('Audio 5 level')) > 0.02)
await control('Audio 4 solo').click()
await page.waitForTimeout(1000)
check('soloing Audio 4 silences Audio 5', (await meter('Audio 5 level')) === 0 && (await meter('Audio 4 level')) > 0.02)
await control('Audio 4 send to Return A').fill('1')
await page.waitForTimeout(1000)
const fedReturn = await meter('Return A level')
check('a soloed track keeps the return it feeds (the return is heard)', fedReturn > 0.02, fedReturn.toFixed(3))
await control('Audio 4 solo').click()
await control('Audio 5 solo').click()
await page.waitForTimeout(1000)
check('soloing Audio 5 instead silences Audio 4 and the return Audio 5 does not feed', (await meter('Audio 4 level')) === 0 && (await meter('Return A level')) === 0 && (await meter('Audio 5 level')) > 0.02)
await control('Audio 5 solo').click()
await page.waitForTimeout(1000)
check('with no solo everything is heard again', (await meter('Audio 4 level')) > 0.02 && (await meter('Audio 5 level')) > 0.02 && (await meter('Return A level')) > 0.02)

await page.screenshot({ path: `${dir}/mixer-playing.png` })

// ---- mute silences the track's sends too (the return gets nothing from a muted Audio 4; Audio 5 sends nothing)
await control('Audio 4 mute').click()
await page.waitForTimeout(1000)
check('a muted track also stops sending: the return goes quiet', (await meter('Return A level')) === 0)
await control('Audio 4 mute').click()

// ---- master volume
await control('Master fader').fill('0')
await page.waitForTimeout(1000)
const silent = await listen(page, 700)
check('master volume 0 silences everything', silent.peak[0] < 0.001 && silent.peak[1] < 0.001 && (await meter('Master level')) === 0, show(silent))
check('the track meters still move (they are before the master fader)', (await meter('Audio 4 level')) > 0.02)
await control('Master fader').fill('1')
await page.waitForTimeout(1000)
const restored = await listen(page, LOOP_WINDOW_MS)
check('master volume 1 restores it', restored.peak[0] > 0.01, show(restored))

// ---- undo and redo
await control('Audio 4 mute').click()
check('mute is on', await pressed('Audio 4 mute'))
await page.getByRole('button', { name: 'Undo' }).click()
check('undo unmutes', !(await pressed('Audio 4 mute')))
await page.getByRole('button', { name: 'Redo' }).click()
check('redo mutes again', await pressed('Audio 4 mute'))
await page.getByRole('button', { name: 'Undo' }).click()
for (const value of ['-0.2', '-0.5', '-0.8']) await control('Audio 5 pan').fill(value)
await page.getByRole('button', { name: 'Undo' }).click()
check('dragging the pan is one undo step', (await control('Audio 5 pan').inputValue()) === '0', await control('Audio 5 pan').inputValue())
for (const value of ['0.9', '0.5', '0.3']) await control('Master fader').fill(value)
await page.getByRole('button', { name: 'Undo' }).click()
check('and so is dragging the master fader', (await control('Master fader').inputValue()) === '1', await control('Master fader').inputValue())
await page.getByRole('button', { name: 'Redo' }).click()

// ---- everything survives a reload
await control('Audio 4 pan').fill('0.5')
await control('Audio 5 mute').click()
await control('Audio 4 solo').click()
await page.waitForTimeout(2000)
await page.reload()
await mixer()
check('pan, mute, solo and the master volume survive a reload', (await control('Audio 4 pan').inputValue()) === '0.5' && (await pressed('Audio 5 mute')) && (await pressed('Audio 4 solo')) && (await control('Master fader').inputValue()) === '0.3', `${await control('Audio 4 pan').inputValue()} ${await control('Master fader').inputValue()}`)
check('...and the send knob', (await control('Audio 4 send to Return A').inputValue()) === '1')

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
