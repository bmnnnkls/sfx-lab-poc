import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const require = createRequire('/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

// export the demo, then wire an LFO into the Bass patch and put a reverb after its delay
await page.getByText('File', { exact: true }).click()
const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Export to file…').click()])
await download.saveAs(`${dir}/mod-base.json`)
const file = JSON.parse(readFileSync(`${dir}/mod-base.json`, 'utf8'))
const patch = file.project.tracks[0].patch
const byType = (t) => patch.nodes.find((n) => n.type === t)
const wire = (id, from, fp, to, tp) => patch.connections.push({ id, from: { node: from.id, port: fp }, to: { node: to.id, port: tp } })
const lfo = { id: 'lfo_1', type: 'lfo', x: 220, y: 380, params: { shape: 0, rate: 5, depth: 1 } }
const lfo2 = { id: 'lfo_2', type: 'lfo', x: 420, y: 380, params: { shape: 1, rate: 0.5, depth: 1 } }
const verb = { id: 'verb_1', type: 'reverb', x: 1020, y: 40, params: { size: 0.8, damping: 0.3, mix: 0.4, predelay: 20 } }
patch.nodes.push(lfo, lfo2, verb)
byType('filter').params.cutoff = 900
byType('filter').params.cvAmount = 3
wire('w_a', lfo2, 'out', byType('filter'), 'cutoff')
wire('w_b', lfo, 'out', byType('oscillator'), 'pitch')
patch.connections = patch.connections.filter((c) => !(c.from.node === byType('delay').id && c.to.node === byType('output').id))
wire('w_c', byType('delay'), 'out', verb, 'in')
wire('w_d', verb, 'out', byType('output'), 'in')
writeFileSync(`${dir}/mod-import.json`, JSON.stringify(file))

await page.getByText('File', { exact: true }).click()
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Import from file…').click()])
await chooser.setFiles(`${dir}/mod-import.json`)
await page.waitForTimeout(500)
check('import accepted (no error toast)', !(await page.getByText(/couldn.t|invalid|failed/i).count()))

await page.getByRole('button', { name: 'Edit Root' }).click()
await page.getByRole('tab', { name: 'Instrument' }).or(page.getByRole('button', { name: 'Instrument', exact: true })).first().click()
await page.waitForTimeout(400)
check('patcher shows LFO nodes', (await page.getByText('LFO', { exact: true }).count()) >= 2)
check('patcher shows the Reverb node', (await page.getByText('Reverb', { exact: true }).count()) >= 1)
check('wires are drawn for the new connections', (await page.locator('svg path, svg line').count()) >= 10, String(await page.locator('svg path, svg line').count()))
await page.screenshot({ path: `${dir}/17-patch-lfo.png` })

// play the Root clip through the real worklet with modulation + reverb in the chain
await page.locator('[class*="_launch_"]').first().click()
const heard = await level(3500)
check('modulated patch makes sound through the real worklet', heard > 0.02, heard.toFixed(3))
await page.getByRole('button', { name: 'Stop all' }).or(page.getByRole('button', { name: 'Stop' })).first().click().catch(() => {})

// tail: stop the transport and the reverb/delay keep ringing briefly (shared stage outlives notes)
// palette adds the new types
const before = await page.locator('[data-node-id]').count().catch(() => 0)
await page.getByRole('button', { name: 'LFO', exact: true }).click()
await page.getByRole('button', { name: 'Reverb', exact: true }).click()
const after = await page.locator('[data-node-id]').count().catch(() => 0)
check('the palette offers LFO and Reverb', (await page.getByRole('button', { name: 'LFO', exact: true }).count()) === 1 && (await page.getByRole('button', { name: 'Reverb', exact: true }).count()) === 1, `nodes ${before} -> ${after}`)
await page.screenshot({ path: `${dir}/18-palette.png` })
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
