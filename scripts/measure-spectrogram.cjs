// Times the Wave editor's spectrogram in Chromium, on the dev server's modules (round 11d-1), for a 120 s stereo 48 kHz
// sample (memory storage), the lanes on the spectrogram, the view at 60 s and 600 frames a pixel (25 s in 2000 px):
//   view       From the lanes switching to the spectrogram (the working copy loaded) to the view's columns filled.
//   full       The same, to the whole pyramid filled.
//   longestTaskMs  The longest main-thread task while it fills (a `longtask` observer; the spec asks under 50 ms).
//   drawMs     One redraw of the view's two lanes, 1400 × 300 px each (`spectrumColumnsFor` and `paintSpectrum`), median
//              of 20.
//   updateMs   `updateSpectrumPyramid` after a 1 s Gain at 60 s: the main thread's copy of the untouched columns.
//   editRefillMs  From the edit's result in the pane to its spectrum filled again, and the columns computed for it;
//              editTotalMs from the edit's call, and editLongestTaskMs the longest task meanwhile (the edit's own encode
//              and hash included); editLongestTaskWaveformMs the same for an edit with the lanes on the waveform.
//   observerSaw  The longest task the observer saw from a 60 ms busy loop made on purpose: proof it reports.
//   onDemandMs  A view at 50 frames a pixel, 1400 px wide: from its ask to its answer, median of 5.
//   columnUs   One base column of one channel at FFT 2048 on the main thread (the worker's cost per column), median
//              of 5 runs of 2000.
// Median of 3 runs for view, full and editRefillMs, each on a sample not opened before.
//
// Usage: start the dev server (`npx vite --port 5288`), then `node scripts/measure-spectrogram.cjs http://localhost:5288`.
// Prints one JSON object, in milliseconds (columnUs in microseconds).
const { chromium } = require('@playwright/test')

const [devUrl] = process.argv.slice(2)
if (!devUrl) {
  console.error('Usage: node scripts/measure-spectrogram.cjs <dev-url>')
  process.exit(2)
}

const main = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  // The dev server's page without the app: the app's own services would answer the same stores.
  await page.route(/\/src\/main\.tsx/, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }))
  await page.goto(devUrl)
  const result = await page.evaluate(async () => {
    const core = await import('/src/core/index.ts')
    const state = await import('/src/state/index.ts')
    const { createMemorySampleStorage, sha256Hex } = await import('/src/storage/index.ts')
    const { createSpectrumService } = await import('/src/audio/index.ts')
    const { createSampleLibrary } = await import('/src/app/sample-library.ts')
    const { createWaveSpectra } = await import('/src/app/wave-spectrum.ts')
    const { binRows, colorLookup, paintSpectrum } = await import('/src/ui/wave-editor/spectrogram.ts')
    const { useProjectStore, useSelectionStore, useWaveAudioStore, useWaveEditSettings, useWaveEditorStore, useWaveSpectrumStore, waveViewKey } = state
    const median = (runs) => {
      const sorted = [...runs].sort((a, b) => a - b)
      return +sorted[Math.floor(sorted.length / 2)].toFixed(2)
    }
    const until = (check) =>
      new Promise((resolve) => {
        const poll = () => (check() ? resolve(performance.now()) : setTimeout(poll, 2))
        poll()
      })
    let longest = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration)
    }).observe({ type: 'longtask' })
    // The observer sees a long task: one of 60 ms, made on purpose.
    const busy = performance.now()
    while (performance.now() - busy < 60);
    await new Promise((resolve) => setTimeout(resolve, 50))
    const observerSaw = +longest.toFixed(1)

    const rate = 48000
    const frames = rate * 120
    const storage = createMemorySampleStorage()
    const sample = async (seed, name) => {
      const channels = [0, 1].map((channel) => Float32Array.from({ length: frames }, (_, i) => Math.sin(i * 0.013 + seed + channel) * 0.5 + Math.sin(i * 1.7 * (seed + 1)) * 0.1 + Math.sin(i * i * 1e-9) * 0.2))
      const bytes = core.encodeWavChannels(channels, rate, 16)
      const id = await sha256Hex(bytes)
      await storage.put(id, bytes)
      return { id, name, extension: 'wav', durationSeconds: 120, sampleRate: rate, channels: 2, bytes: bytes.length }
    }
    const runs = [await sample(1, 'One'), await sample(2, 'Two'), await sample(3, 'Three')]
    useProjectStore.getState().resetProject({ ...core.createEmptyProject(), samples: runs })
    const library = createSampleLibrary(storage, { send: () => {} }, { freeBytes: async () => null })
    library.connect()
    createWaveSpectra(createSpectrumService()).connect()

    const viewFrom = 60 * rate
    const viewTo = viewFrom + 600 * 2000
    const view = { view: [], full: [], longestTaskMs: 0 }
    for (const info of runs) {
      useWaveEditSettings.getState().setLanes('waveform')
      useWaveEditorStore.getState().setView(waveViewKey('main', core.originOf(info)), { startFrame: viewFrom, framesPerPixel: 600 })
      useSelectionStore.getState().selectSample(info.id)
      await until(() => useWaveAudioStore.getState().panes.main?.sampleId === info.id)
      longest = 0
      const start = performance.now()
      useWaveEditSettings.getState().setLanes('spectrogram')
      const filled = (from, to) => {
        const pyramid = useWaveSpectrumStore.getState().spectra[info.id]?.pyramid
        if (!pyramid) return false
        const base = pyramid.levels[0]
        for (let column = Math.floor(from / pyramid.hop); column < Math.min(base.count, Math.ceil(to / pyramid.hop)); column++) if (!base.filled[column]) return false
        return true
      }
      view.view.push((await until(() => filled(viewFrom, viewTo))) - start)
      view.full.push((await until(() => filled(0, frames))) - start)
      await new Promise((resolve) => setTimeout(resolve, 100))
      view.longestTaskMs = Math.max(view.longestTaskMs, longest)
    }

    // One redraw: two lanes of 1400 × 300 from the pyramid at 600 frames a pixel.
    const shown = useWaveAudioStore.getState().panes.main
    const spectrum = useWaveSpectrumStore.getState().spectra[shown.sampleId].pyramid
    const rows = binRows(300, 'log', spectrum.bins, rate)
    const colors = colorLookup(-100)
    const pixels = new Uint32Array(1400 * 300)
    const draws = []
    for (let run = 0; run < 20; run++) {
      const start = performance.now()
      const columns = core.spectrumColumnsFor({ startFrame: viewFrom + run * 6000, framesPerPixel: 600, width: 1400 }, spectrum)
      for (let channel = 0; channel < 2; channel++) paintSpectrum(pixels, 1400, 300, { kind: columns.kind, bins: columns.bins, data: columns.data[channel], from: columns.from, to: columns.to }, rows, colors)
      draws.push(performance.now() - start)
    }

    // An edit: the pyramid's copy, then the result's refill through the app.
    const edit = { kind: 'gain', range: { from: viewFrom, to: viewFrom + rate }, channels: 'both', db: -6, ramp: { frames: 0, curve: 'linear' } }
    const edited = core.applySampleEdit(shown.audio, edit)
    const changed = core.changedFrames(edit, frames)
    const copies = []
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      core.updateSpectrumPyramid(spectrum, edited, changed)
      copies.push(performance.now() - start)
    }
    const before = shown.sampleId
    // The timings above ran in one task of their own: let it end before watching the edit.
    await new Promise((resolve) => setTimeout(resolve, 100))
    longest = 0
    const editStart = performance.now()
    await library.editSample(before, edit, { asCopy: false, pane: 'main' })
    const after = useWaveAudioStore.getState().panes.main.sampleId
    const refillStart = performance.now()
    await until(() => useWaveSpectrumStore.getState().spectra[after]?.pyramid.levels[0].filled.every((flag) => flag === 1))
    const editRefillMs = performance.now() - refillStart
    const editTotalMs = performance.now() - editStart
    await new Promise((resolve) => setTimeout(resolve, 100))
    const editLongestTaskMs = longest
    // The same edit with the lanes on the waveform: what the edit's tasks are without the spectrum.
    useWaveEditSettings.getState().setLanes('waveform')
    await new Promise((resolve) => setTimeout(resolve, 100))
    longest = 0
    await library.editSample(after, { ...edit, db: -3 }, { asCopy: false, pane: 'main' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const editLongestTaskWaveformMs = longest
    useWaveEditSettings.getState().setLanes('spectrogram')
    await until(() => useWaveSpectrumStore.getState().spectra[useWaveAudioStore.getState().panes.main.sampleId]?.pyramid.levels[0].filled.every((flag) => flag === 1))
    const refilled = core.columnsToFill(core.updateSpectrumPyramid(spectrum, edited, changed)).reduce((total, range) => total + range.to - range.from, 0)

    // Columns on demand at 50 frames a pixel.
    const onDemand = []
    if (useWaveSpectrumStore.getState().ask) {
      for (let run = 0; run < 5; run++) {
        const shownId = useWaveAudioStore.getState().panes.main.sampleId
        const ask = core.spectrumAsk({ startFrame: viewFrom + run * 100_000, framesPerPixel: 50, width: 1400 }, shownId, 2048, frames)
        const start = performance.now()
        useWaveSpectrumStore.getState().ask('main', ask)
        await until(() => core.sameAsk(useWaveSpectrumStore.getState().answers.main, ask))
        onDemand.push(performance.now() - start)
      }
    }

    // The cost of a column, on this thread.
    const columns = []
    for (let run = 0; run < 5; run++) {
      const start = performance.now()
      core.spectrumColumnBytes(2048, shown.audio.channels[0], 1000, 3000)
      columns.push(((performance.now() - start) / 2000) * 1000)
    }

    return {
      viewMs: median(view.view),
      fullMs: median(view.full),
      longestTaskMs: +view.longestTaskMs.toFixed(1),
      drawMs: median(draws),
      updateMs: median(copies),
      editRefillMs: +editRefillMs.toFixed(1),
      editTotalMs: +editTotalMs.toFixed(1),
      editLongestTaskMs: +editLongestTaskMs.toFixed(1),
      editLongestTaskWaveformMs: +editLongestTaskWaveformMs.toFixed(1),
      observerSaw,
      refilledColumns: refilled,
      onDemandMs: onDemand.length ? median(onDemand) : null,
      columnUs: median(columns),
      spectrumMB: +(core.spectrumBytes(frames, 2, 2048) / 1e6).toFixed(1),
    }
  })
  console.log(JSON.stringify(result))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
