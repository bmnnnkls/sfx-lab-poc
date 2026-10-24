/** Bounded demo walkthrough against an already-running production preview; no capacity instrumentation. */
import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
const baseURL = process.env.DEMO_URL ?? 'http://127.0.0.1:4173'
const output = process.env.DEMO_REPORT ?? 'docs/measurements/demo-release/arrangements.json'
const examples = [
  { name: 'Low Light', beats: Array(8).fill(16) },
  { name: 'Glass Rain', beats: Array(6).fill(64) },
]
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errors = [], report = { started: new Date().toISOString(), examples: [], errors }
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const beat = async () => {
  const position = await page.locator('header span[class*="position"]').textContent()
  const [bar, within] = position.split('.').map(Number)
  if (!Number.isFinite(bar) || !Number.isFinite(within)) throw Error(`Invalid transport: ${position}`)
  return (bar - 1) * 4 + within - 1
}
try {
  await page.goto(baseURL)
  for (const example of examples) {
    if (await page.getByLabel('Project name').inputValue() !== example.name) {
      await page.getByText('File', { exact: true }).click()
      await page.getByRole('button', { name: new RegExp(`^${example.name}`) }).click()
    }
    await expect(page.getByLabel('Project name')).toHaveValue(example.name)
    await expect.poll(beat).toBe(0)
    const scenes = [], entry = { name: example.name, scenes }
    report.examples.push(entry)
    for (const [index, patternBeats] of example.beats.entries()) {
      const requestedBeat = await beat()
      await page.getByRole('button', { name: new RegExp(`^Launch scene ${index + 1}(?:,|$)`) }).click()
      // Allow a whole quantization boundary before counting a complete longest clip pattern.
      const throughBeat = Math.ceil(requestedBeat / 4) * 4 + 4 + patternBeats
      const started = Date.now()
      let peak = 0, currentBeat = requestedBeat
      while (currentBeat < throughBeat) {
        if (Date.now() - started > 90_000) throw Error(`${example.name} scene ${index + 1}: transport stalled`)
        if (await page.getByRole('alert').count()) throw Error('Audio failure alert during arrangement')
        if (errors.length) throw Error(errors.join('\n'))
        const value = Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))
        if (!Number.isFinite(value)) throw Error('Non-finite output meter')
        peak = Math.max(peak, value)
        await page.waitForTimeout(250)
        currentBeat = await beat()
      }
      if (peak <= 0.001) throw Error(`${example.name} scene ${index + 1}: no audible meter output`)
      const scene = { scene: index + 1, patternBeats, requestedBeat, throughBeat, observedBeat: currentBeat, peak, elapsedMs: Date.now() - started }
      scenes.push(scene)
      console.log(JSON.stringify({ example: example.name, ...scene }))
    }
    await page.screenshot({ path: output.replace(/\.json$/, `-${example.name.replaceAll(' ', '-').toLowerCase()}.png`) })
    await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
    await page.waitForTimeout(1000)
  }
  report.completed = new Date().toISOString()
} catch (error) {
  report.failure = String(error)
  throw error
} finally {
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
