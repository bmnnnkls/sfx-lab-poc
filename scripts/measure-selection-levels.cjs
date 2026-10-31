// Times `selectionLevels` (the Wave editor's peak and RMS of a selection) in Chromium, on the dev server's modules:
// 120 s of stereo at 48 kHz, the whole of it on both channels and on one, and a tenth of it. Median of 7 runs each,
// after 2 warm-up runs.
//
// Usage: start the dev server (`npx vite --port 5288`), then `node scripts/measure-selection-levels.cjs http://localhost:5288`.
// Prints one JSON object, in milliseconds.
const { chromium } = require('@playwright/test')

const [devUrl] = process.argv.slice(2)
if (!devUrl) {
  console.error('Usage: node scripts/measure-selection-levels.cjs <dev-url>')
  process.exit(2)
}

const main = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(devUrl)
  const result = await page.evaluate(async () => {
    const { selectionLevels } = await import('/src/core/index.ts')
    const rate = 48000
    const frames = rate * 120
    const channels = [0, 1].map((seed) => Float32Array.from({ length: frames }, (_, i) => Math.sin(i * 0.013 + seed) * 0.5 + Math.sin(i * 1.7) * 0.1))
    const audio = { sampleRate: rate, channels }
    const time = (range, which) => {
      const runs = []
      for (let run = 0; run < 9; run++) {
        const start = performance.now()
        selectionLevels(audio, range, which)
        runs.push(performance.now() - start)
      }
      const measured = runs.slice(2).sort((a, b) => a - b)
      return +measured[Math.floor(measured.length / 2)].toFixed(2)
    }
    return {
      wholeStereo: time({ from: 0, to: frames }, 'both'),
      wholeOneChannel: time({ from: 0, to: frames }, 'left'),
      tenthStereo: time({ from: 0, to: frames / 10 }, 'both'),
    }
  })
  console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2))
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
