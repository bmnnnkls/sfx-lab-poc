// Times *Revert to original* and the zero-crossing search in Chromium, on the dev server's modules (round 11c-2):
//   revert   `SampleLibrary.revertSample` of a 120 s stereo 48 kHz sample edited once in place (a reverse of all of
//            it): read the original's bytes (memory storage), decode them, send the engine its audio, and commit. An
//            undo before each run brings the edited version back; the first run, which also hands the engine the
//            audio, is reported apart. `decode` is `decodeAudio` of the same bytes alone, for comparison.
//   zero     `nearestZeroCrossing` at the widest zoom: 120 s across 1000 columns is 5760 frames a column, so snapping
//            looks 8 columns, 46,080 frames, either way. On a sine (a crossing near) and on a constant (none: the
//            whole reach is read).
// Median of 7 runs after 2 warm-ups (revert: of 5 after the first).
//
// Usage: start the dev server (`npx vite --port 5288`), then `node scripts/measure-revert-and-zero.cjs http://localhost:5288`.
// Prints one JSON object, in milliseconds.
const { chromium } = require('@playwright/test')

const [devUrl] = process.argv.slice(2)
if (!devUrl) {
  console.error('Usage: node scripts/measure-revert-and-zero.cjs <dev-url>')
  process.exit(2)
}

const main = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(devUrl)
  const result = await page.evaluate(async () => {
    const core = await import('/src/core/index.ts')
    const { useProjectStore } = await import('/src/state/index.ts')
    const { createMemorySampleStorage, sha256Hex } = await import('/src/storage/index.ts')
    const { decodeAudio } = await import('/src/audio/index.ts')
    const { createSampleLibrary } = await import('/src/app/sample-library.ts')
    const median = (runs) => {
      const sorted = [...runs].sort((a, b) => a - b)
      return +sorted[Math.floor(sorted.length / 2)].toFixed(2)
    }

    const rate = 48000
    const frames = rate * 120
    const channels = [0, 1].map((seed) => Float32Array.from({ length: frames }, (_, i) => Math.sin(i * 0.013 + seed) * 0.5 + Math.sin(i * 1.7) * 0.1))
    const bytes = core.encodeWavChannels(channels, rate, 16)
    const id = await sha256Hex(bytes)
    const storage = createMemorySampleStorage()
    await storage.put(id, bytes)
    const info = { id, name: 'Long', extension: 'wav', durationSeconds: 120, sampleRate: rate, channels: 2, bytes: bytes.length }
    useProjectStore.getState().resetProject({ ...core.createEmptyProject(), samples: [info] })
    const library = createSampleLibrary(storage, { send: () => {} }, { freeBytes: async () => null })
    await library.editSample(id, { kind: 'reverse', range: { from: 0, to: frames }, channels: 'both' }, { asCopy: false })
    const edited = useProjectStore.getState().project.samples[0]
    if (!edited.lineage) throw new Error('The edit did not land')

    const revertRuns = []
    for (let run = 0; run < 6; run++) {
      if (run > 0) useProjectStore.getState().undo()
      const start = performance.now()
      await library.revertSample(useProjectStore.getState().project.samples[0].id)
      revertRuns.push(performance.now() - start)
      if (useProjectStore.getState().project.samples[0].id !== id) throw new Error('The revert did not land')
    }
    const decodeRuns = []
    for (let run = 0; run < 7; run++) {
      const start = performance.now()
      await decodeAudio(bytes)
      decodeRuns.push(performance.now() - start)
    }

    const reach = 8 * (frames / 1000)
    const zero = (audio) => {
      const runs = []
      for (let run = 0; run < 9; run++) {
        const start = performance.now()
        for (let i = 0; i < 100; i++) core.nearestZeroCrossing(audio, frames / 2 + i, 'both', reach)
        runs.push((performance.now() - start) / 100)
      }
      return +median(runs.slice(2)).toFixed(4)
    }
    return {
      revertFirst: +revertRuns[0].toFixed(2),
      revert: median(revertRuns.slice(1)),
      decode: median(decodeRuns.slice(2)),
      zeroOnSine: zero({ sampleRate: rate, channels }),
      zeroOnConstant: zero({ sampleRate: rate, channels: [new Float32Array(frames).fill(0.25), new Float32Array(frames).fill(0.25)] }),
    }
  })
  console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2))
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
