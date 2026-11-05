import { samplePresetProject } from '../support/preset-project'
import { exportLibraryBundle } from '../../../src/storage'
import { captureLibraryAsset, emptyLibrary, insertLibraryAsset, renderProject, serializeProject, parseProject, saveProjectPreset, editControlBase, type Project } from '../../../src/core'
import { test, expect, expectSaved, libraryPanel, openView, saveToLibrary, treeRow, viewRoot } from '../support/fixtures'
import { noteSweepProject, slotSweepProject, sweepProject, sweepTarget } from '../support/automation-project'

declare global { interface Window { __sweepSamples: number[] } }
for (const mode of ['clip', 'notes', 'slots', 'touch', 'preset', 'sample-preset', 'library-preset', 'bundle-preset', 'linked-preset']) {
const slots = mode === 'slots', touch = mode === 'touch', linked = mode === 'linked-preset', preset = mode === 'preset' || linked, bundlePreset = mode === 'bundle-preset', samplePreset = mode === 'sample-preset' || mode === 'library-preset' || bundlePreset, libraryPreset = mode === 'library-preset' || bundlePreset
test(`the real worklet ${linked ? 'library preset recalled through its link' : bundlePreset ? 'imported bundle sample asset after trash/reload' : libraryPreset ? 'independent library sample asset after trash/reload' : samplePreset ? 'recalled instance sample preset' : preset ? 'recalled project preset' : touch ? 'Touch take' : slots ? 'return/master slots' : mode === 'notes' ? 'helper/notes and filter curves' : 'clip filter sweep'} matches offline sample timing across wraps`, async ({ page }) => {
  let project: Project = slots ? slotSweepProject() : mode === 'notes' ? noteSweepProject() : sweepProject()
  if (preset) {
    project = { ...project, tracks: project.tracks.map(t => t.kind === 'instrument' ? { ...t, clips: t.clips.map(c => c ? { ...c, automation: [] } : c) } : t) }
    const scope = { owner: sweepTarget.owner, domain: 'patch' as const }
    project = saveProjectPreset(project, scope, 'Warm')
    project = saveProjectPreset(editControlBase(project, sweepTarget, 12000).project, scope, 'Bright')
    // Linked: the sound's own state is a third cutoff, so recalling Bright from the library changes something.
    if (linked) project = editControlBase(project, sweepTarget, 500).project
  }
  const sampleFixture = samplePreset ? samplePresetProject() : undefined
  if (sampleFixture) project = sampleFixture.project
  const samples = sampleFixture?.samples.map(s => s.decoded) ?? []
  const expectedProject = sampleFixture?.recalled ?? project
  const offline = renderProject(expectedProject, samples, { scope: { kind: 'clip', trackId: 'sweep', clipId: 'sweep-clip' }, bars: slots ? 2 : 1, maxTail: 0 })
  const scene = renderProject(expectedProject, samples, { scope: { kind: 'scene', scene: 0 }, bars: slots ? 2 : 1, maxTail: 0 })
  if (slots || samplePreset) expect(scene.left).not.toEqual(offline.left)
  else expect(scene.left).toEqual(offline.left)
  let expected = slots || samplePreset ? scene : offline
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(project))
  await page.addInitScript(() => {
    const Original = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Original {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        window.__sweepSamples = []
        // Copy on the render thread: ScriptProcessor can lose startup/underflow buffers.
        const url = URL.createObjectURL(new Blob([`
          class SweepCapture extends AudioWorkletProcessor {
            process(inputs) {
              const left = inputs[0]?.[0];
              if (left) this.port.postMessage(left.slice());
              return true;
            }
          }
          registerProcessor('sweep-capture', SweepCapture);
        `], { type: 'text/javascript' }))
        void context.audioWorklet.addModule(url).then(() => {
          const tap = new Original(context, 'sweep-capture'), mute = context.createGain()
          mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
          tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
            if (window.__sweepSamples.length < 400000) window.__sweepSamples.push(...data)
          }
        }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
      }
    }
  })
  await page.goto('/')
  if (sampleFixture) {
    await openView(page, 'Samples')
    await page.getByTestId('sample-input').setInputFiles(sampleFixture.samples.map(s => ({ name: `${s.info.name}.wav`, mimeType: 'audio/wav', buffer: Buffer.from(s.bytes) })))
    for (const s of sampleFixture.samples) await expect(page.getByRole('button', { name: `Preview ${s.info.name}`, exact: true })).toBeEnabled()
    await viewRoot(page, 'Session').getByText('Sweep', { exact: true }).first().click()
    await openView(page, 'Sounds')
    await page.getByRole('button', { name: 'Recall Different sample', exact: true }).click()
    await expectSaved(page)
    // The sample choice is named by the nodes along its path, and shows the recalled sample.
    const sounds = viewRoot(page, 'Sounds')
    await sounds.getByText('Sample choices (1)', { exact: true }).click()
    await expect(sounds.getByRole('combobox', { name: /^Sample for .+ \/ .+$/ })).toHaveValue(sampleFixture.samples[1]!.info.id)
    if (libraryPreset) {
      await openView(page, 'Library')
      const panel = libraryPanel(page)
      if (bundlePreset) {
        const catalog = captureLibraryAsset(emptyLibrary(), sampleFixture.recalled, { owner: { kind: 'track', trackId: 'sweep' }, domain: 'patch' }, 'Reusable sampled voice', null)
        const bundle = await exportLibraryBundle(catalog, { itemIds: catalog.items.map(i => i.id) }, 'Audible exchange', async id => sampleFixture.samples.find(s => s.info.id === id)?.bytes)
        await panel.getByLabel('Import library bundle', { exact: true }).setInputFiles({ name: bundle.fileName, mimeType: bundle.mimeType, buffer: Buffer.from(bundle.bytes) })
        await page.getByRole('dialog', { name: 'Bundle review' }).getByRole('button', { name: 'Import', exact: true }).click()
        // The import's folder, in the library's tree (named with its item count).
        await treeRow(panel, 'Audible exchange').click()
        await treeRow(panel, 'Audible exchange').press('ArrowRight')
      } else {
        await saveToLibrary(page, viewRoot(page, 'Session').getByRole('button', { name: 'Sweep', exact: true }), 'Instrument + notes')
        await openView(page, 'Library')
      }
      const voice = treeRow(panel, bundlePreset ? 'Reusable sampled voice' : 'Sweep')
      await voice.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Replace selected graph', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'copied into project' })).toBeVisible()
      await voice.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Trash', exact: true }).click()
      await expect(voice).toHaveCount(0)
      await expectSaved(page)
      const saved = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
      if (!saved.ok) throw new Error(saved.error)
      expect(saved.project.libraryOrigins).toHaveLength(1)
      expected = renderProject(saved.project, samples, { scope: { kind: 'scene', scene: 0 }, bars: 1, maxTail: 0 })
    }
    // A fresh engine proves both persisted uses, without any previous sample tail.
    await page.reload()
    await openView(page, 'Samples')
    for (const s of sampleFixture.samples) await expect(page.getByRole('button', { name: `Preview ${s.info.name}`, exact: true })).toBeEnabled()
  }
  if (linked) {
    // Saved to the library, put back onto Sweep from there (so Sweep is linked), and Bright recalled from Sounds'
    // library section. It must sound as inserting Bright itself does.
    const session = viewRoot(page, 'Session')
    await session.getByText('Sweep', { exact: true }).first().click()
    await saveToLibrary(page, session.getByRole('button', { name: 'Sweep', exact: true }), 'Instrument + notes')
    await openView(page, 'Library')
    const voice = treeRow(libraryPanel(page), 'Sweep')
    await voice.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Replace selected graph', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'copied into project' })).toBeVisible()
    const sounds = await openView(page, 'Sounds')
    await sounds.getByRole('region', { name: 'From the library · Sweep', exact: true }).getByRole('button', { name: 'Recall Bright', exact: true }).click()
    await expect(sounds.getByRole('status')).toContainText('controls recalled')
    await expectSaved(page)
    const saved = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
    if (!saved.ok) throw new Error(saved.error)
    const scope = { owner: sweepTarget.owner, domain: 'patch' as const }
    const catalog = captureLibraryAsset(emptyLibrary(), project, scope, 'Sweep', null)
    const inserted = insertLibraryAsset(project, catalog, catalog.items.find(i => i.name === 'Bright')!, { mode: 'replace', scope }).project
    expected = renderProject(inserted, [], { scope: { kind: 'clip', trackId: 'sweep', clipId: 'sweep-clip' }, bars: 1, maxTail: 0 })
    const recalled = renderProject(saved.project, [], { scope: { kind: 'clip', trackId: 'sweep', clipId: 'sweep-clip' }, bars: 1, maxTail: 0 })
    expect(Math.max(...recalled.left.map((v, i) => Math.abs(v - expected.left[i]!)))).toBeLessThan(0.00002)
    expect(expected.left).not.toEqual(offline.left)
  } else if (preset) {
    await viewRoot(page, 'Session').getByText('Sweep', { exact: true }).first().click()
    await openView(page, 'Sounds')
    await page.getByRole('button', { name: 'Recall Warm', exact: true }).click()
    await page.getByRole('button', { name: 'Recall Bright', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'controls recalled' })).toBeVisible()
    await expectSaved(page)
    const saved = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
    if (!saved.ok) throw new Error(saved.error)
    const expectedPreset = project.presets!.find(p => p.name === 'Bright')!
    expect(saved.project.controlValues ?? []).toEqual(project.controlValues ?? [])
    expect(expectedPreset.revisionId).toBe(project.presets![0]!.revisionId)
  }
  // Prime the render-thread capture with silence before any sound starts.
  // Wait for the capture node to be connected before sending a launch command.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__sweepSamples?.length ?? 0)).toBeGreaterThan(4096)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  if (touch) {
    await page.getByRole('button', { name: 'Arm Touch automation', exact: true }).click()
    await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
    await openView(page, 'Mixer')
    const fader = page.getByLabel('Sweep fader', { exact: true })
    const box = await fader.boundingBox(); if (!box) throw new Error('No fader')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.25); await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.1, { steps: 12 })
    await page.waitForTimeout(1300)
    await page.mouse.up()
    await expect(page.getByText('Touch take saved', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
    await expectSaved(page)
    const saved = await page.evaluate(() => localStorage.getItem('sfxlab:project'))
    const parsed = parseProject(saved!)
    if (!parsed.ok) throw new Error('Recorded project did not parse')
    expected = renderProject(parsed.project, [], { scope: { kind: 'scene', scene: 0 }, bars: 1, maxTail: 0 })
    expect(expected.left.some((v) => Math.abs(v) > 1e-7), 'the recorded take stays audible').toBe(true)
    const recordedTrack = parsed.project.tracks[0]
    expect(recordedTrack?.kind !== 'return' && recordedTrack?.clips[0]?.automation?.length).toBe(2)
    // Reload the authored take into a fresh engine; old un-enveloped release tails must not contaminate it.
    await page.reload()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__sweepSamples?.length ?? 0)).toBeGreaterThan(4096)
    await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  }
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  const firstOffline = expected.left.findIndex((v) => Math.abs(v) > 1e-7)
  await expect.poll(() => page.evaluate(() => {
    const samples = window.__sweepSamples, first = samples.findIndex((v) => Math.abs(v) > 1e-7)
    return first < 0 ? 0 : samples.length - first
  }), { timeout: 15000 }).toBeGreaterThanOrEqual(expected.left.length - firstOffline)
  const live = await page.evaluate(() => window.__sweepSamples)
  const firstLive = live.findIndex((v) => Math.abs(v) > 1e-7)
  expect(firstLive).toBeGreaterThan(0); expect(firstOffline).toBeGreaterThanOrEqual(0)
  expect(live.length - firstLive).toBeGreaterThanOrEqual(expected.left.length - firstOffline)
  expect(live.every(Number.isFinite), 'captured samples are finite').toBe(true)
  let worst = 0, worstFrame = 0
  for (let i = 0; i < expected.left.length - firstOffline; i++) { const error = Math.abs(live[firstLive + i]! - expected.left[firstOffline + i]!); if (error > worst) { worst = error; worstFrame = i } }
  expect(worst, `real output matches offline: live start ${firstLive}, offline start ${firstOffline}, worst frame ${worstFrame}`).toBeLessThan(0.00002)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})

}
