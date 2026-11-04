// Times opening the Wave editor's second pane in Chromium, on the dev server's modules (round 11c-3):
//   another  The second pane opened on another 120 s stereo 48 kHz sample than the first's: read its bytes (memory
//            storage), decode them and build the peak pyramid. Each run on a sample not opened before, so nothing is
//            in the working copies' cache.
//   same     The second pane opened on the first pane's sample: it shares the first's working copy, decoding nothing
//            (checked: the two panes hold the same audio).
// From the call that opens it to the pane's working copy being there. Median of 3 runs (another) and of 7 after 2
// warm-ups (same).
//
// Usage: start the dev server (`npx vite --port 5288`), then `node scripts/measure-second-pane.cjs http://localhost:5288`.
// Prints one JSON object, in milliseconds.
const { chromium } = require('@playwright/test')

const [devUrl] = process.argv.slice(2)
if (!devUrl) {
  console.error('Usage: node scripts/measure-second-pane.cjs <dev-url>')
  process.exit(2)
}

const main = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  // The dev server's page without the app: the app's own sample library would answer the same stores.
  await page.route(/\/src\/main\.tsx/, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }))
  await page.goto(devUrl)
  const result = await page.evaluate(async () => {
    const core = await import('/src/core/index.ts')
    const { useProjectStore, useSelectionStore, useWaveAudioStore, useWavePanesStore } = await import('/src/state/index.ts')
    const { createMemorySampleStorage, sha256Hex } = await import('/src/storage/index.ts')
    const { createSampleLibrary } = await import('/src/app/sample-library.ts')
    const median = (runs) => {
      const sorted = [...runs].sort((a, b) => a - b)
      return +sorted[Math.floor(sorted.length / 2)].toFixed(2)
    }

    const rate = 48000
    const frames = rate * 120
    const storage = createMemorySampleStorage()
    const sample = async (seed, name) => {
      const channels = [0, 1].map((channel) => Float32Array.from({ length: frames }, (_, i) => Math.sin(i * 0.013 + seed + channel) * 0.5 + Math.sin(i * 1.7 * (seed + 1)) * 0.1))
      const bytes = core.encodeWavChannels(channels, rate, 16)
      const id = await sha256Hex(bytes)
      await storage.put(id, bytes)
      return { id, name, extension: 'wav', durationSeconds: 120, sampleRate: rate, channels: 2, bytes: bytes.length }
    }
    const first = await sample(0, 'First')
    const others = [await sample(1, 'Other 1'), await sample(2, 'Other 2'), await sample(3, 'Other 3')]
    useProjectStore.getState().resetProject({ ...core.createEmptyProject(), samples: [first, ...others] })
    const library = createSampleLibrary(storage, { send: () => {} }, { freeBytes: async () => null })
    const disconnect = library.connect()
    const held = (pane, id) => new Promise((resolve) => {
      const check = () => (useWaveAudioStore.getState().panes[pane]?.sampleId === id ? resolve() : setTimeout(check, 0))
      check()
    })
    useSelectionStore.getState().selectSample(first.id)
    await held('main', first.id)

    const anotherRuns = []
    for (const other of others) {
      useWavePanesStore.getState().setSecond({ open: false, sampleId: null })
      const start = performance.now()
      useWavePanesStore.getState().setSecond({ open: true, sampleId: other.id })
      await held('second', other.id)
      anotherRuns.push(performance.now() - start)
    }
    const sameRuns = []
    for (let run = 0; run < 9; run++) {
      useWavePanesStore.getState().setSecond({ open: false, sampleId: null })
      const start = performance.now()
      useWavePanesStore.getState().setSecond({ open: true })
      await held('second', first.id)
      sameRuns.push(performance.now() - start)
      const { panes } = useWaveAudioStore.getState()
      if (panes.second.audio !== panes.main.audio) throw new Error('The second pane decoded the first pane\'s sample again')
    }
    disconnect()
    return { another: median(anotherRuns), anotherRuns: anotherRuns.map((run) => +run.toFixed(2)), same: median(sameRuns.slice(2)) }
  })
  console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2))
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
