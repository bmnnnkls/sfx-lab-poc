// Measures the per-frame cost of the UI while the transport plays: React commits, renders and render time in a dev
// build, and Chrome's main-thread counters in a production build.
//
// Usage: node scripts/profile-status.cjs <dev-url> <preview-url> [seconds=10] [setup=editor]
//   Start both servers first, e.g. `npx vite --port 5288` and `npm run build && npx vite preview --port 4288`, then
//   `node scripts/profile-status.cjs http://localhost:5288 http://localhost:4288 10 editor`.
//
// Setups (the starter project, three regions placed on the arrangement, 2 s of warm-up before measuring):
//   editor  Arrangement and Mixer showing, the arrangement playing (the setup rounds 1b and 2 compare against).
//   all     The same, after every panel view (and Sounds) has been shown once: hidden views stay mounted and must do
//           nothing.
//   four    Session and Arrangement side by side over Clip, Mixer in the panel; scene 1 plays, its first clip
//           open in Clip, so Clip's playhead runs too. Needs the docking shell (round 2).
//   groups  Session and Arrangement side by side, Mixer in the panel, the Tracks view open: Lead in an expanded group
//           that sums to a bus, Pad in a collapsed one, Bass hidden; scene 1 plays, so the hidden track sounds. Needs
//           round 8 (round 7 without the bus).
//   pinned  The editor setup, after an L knob and a switch were added to Lead's instrument panel, and Lead's instrument,
//           Lead's effects and the master's effects were pinned, with the Pinned view showing. Needs round 9.
//   wave    The demo drum loop open in the Wave editor, Mixer in the panel, the transport stopped and the loop's preview
//           looping from its start, so the editor's playhead runs. Two markers, a region and the loop are set first
//           (M, R and L), so the mark lane has something to draw. Needs round 11a (the marks, round 11c-2).
//   wave-split  The wave setup with the second pane open on the same sample (View ▾ → Second pane), so two playheads
//           run. Needs round 11c-3.
//   loop    The editor setup with three markers (bars 1, 3 and 5) and a one-bar loop brace over bar 1, turned on, so
//           the arrangement loops while it is measured. Needs round 12b.
//   wave-spectrum  The wave setup with the lanes on the spectrogram (View ▾ → Spectrogram), filled in before
//           measuring, and a box selected in it, so its outline is drawn and ▶ loops its time range. Needs round 11d-2.
//
// Prints one JSON object per build. Each figure is a per-second average over the measured seconds.
const { chromium } = require('@playwright/test')

const [devUrl, previewUrl, secondsArg, setupArg] = process.argv.slice(2)
if (!devUrl || !previewUrl) {
  console.error('Usage: node scripts/profile-status.cjs <dev-url> <preview-url> [seconds] [editor|all|four|groups|pinned|loop|wave|wave-split|wave-spectrum]')
  process.exit(2)
}
const SECONDS = Number(secondsArg ?? 10)
const SETUP = setupArg ?? 'editor'
const WATCHED = ['ArrangementView', 'ArrangementRegion', 'ArrangementPlayhead', 'ArrangementMarks', 'ArrangementMarkLines', 'LevelBar', 'MixerStrip', 'EffectiveValue', 'TransportBar', 'Playhead', 'SessionView', 'ViewHost', 'TracksView', 'GroupCell', 'HiddenTracks', 'SoundingDot', 'ChannelStrip', 'BusStrip', 'GroupStrip', 'GroupVolume', 'PinnedView', 'PinnedPanel', 'PanelView', 'ControlCell', 'CommandHost', 'HostDialogs', 'CommandPalette', 'SampleEditor', 'Overview', 'Ruler', 'DetailView', 'WaveLane', 'WavePlayhead', 'EditToolbar', 'EditSettings', 'ProcessMenu', 'ViewMenu', 'EditorSettings', 'WaveStatus', 'LaneScale', 'MarkLane', 'WavePane', 'PaneTitle', 'PaneSplitter']

// A stub React DevTools hook: React then runs in profiling mode (dev build) and reports every commit.
const hook = () => {
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15])
  const stats = { recording: false, commits: 0, renderMs: 0, rendered: 0, byName: {}, lastCommit: 0 }
  window.__profile = stats
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) { this.renderers.set(1, renderer); return 1 },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      const since = stats.lastCommit
      stats.lastCommit = performance.now()
      if (!stats.recording) return
      stats.commits++
      stats.renderMs += root.current.actualDuration ?? 0
      const stack = [root.current]
      while (stack.length) {
        const fiber = stack.pop()
        if (COMPONENT_TAGS.has(fiber.tag) && (fiber.flags & 1) && fiber.actualStartTime > since) {
          stats.rendered++
          const type = fiber.type?.type ?? fiber.type?.render ?? fiber.type
          const name = type?.displayName ?? type?.name ?? 'anonymous'
          stats.byName[name] = (stats.byName[name] ?? 0) + 1
        }
        if (fiber.sibling) stack.push(fiber.sibling)
        if (fiber.child) stack.push(fiber.child)
      }
    },
  }
}

/** Shows a view: its tab in the docking shell, else (before round 2) its panel button or the transport's. */
const show = async (page, title) => {
  const tab = page.getByRole('tab', { name: title, exact: true })
  if (await tab.count()) {
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
  } else {
    const main = title === 'Session' || title === 'Arrangement'
    await page.getByRole('button', { name: main ? `${title} view` : title, exact: true }).click()
  }
  await page.waitForTimeout(300)
}

/** Drags a view's tab to a fraction of another view's box, with the stepped moves flexlayout needs to start a drag. */
const dock = async (page, title, target, fx, fy) => {
  const from = await page.getByRole('tab', { name: title, exact: true }).boundingBox()
  const to = await page.locator(`[data-view="${target}"]`).boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(to.x + to.width * fx, to.y + to.height * fy, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

/** Runs an entry of a thing's menu, through submenus when given more than one. */
const fromMenu = async (page, target, ...entries) => {
  await target.click({ button: 'right' })
  for (const entry of entries) await page.getByRole('menuitem', { name: entry, exact: true }).click()
}

/** An L knob and a switch on Lead's instrument panel, then Lead's instrument and effects and the master's effects pinned. */
const pinPanels = async (page) => {
  await show(page, 'Session')
  const session = page.locator('[data-view="session"]')
  const lead = session.getByRole('button', { name: 'Lead', exact: true })
  await lead.click()
  await show(page, 'Instrument')
  const instrument = page.locator('[data-view="instrument"]')
  await instrument.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Panel', exact: true }).click()
  await instrument.getByRole('button', { name: 'Edit panel', exact: true }).click()
  const form = instrument.getByRole('form', { name: 'Add a control' })
  for (const kind of ['knob', 'switch']) {
    await form.getByLabel('Control type', { exact: true }).selectOption(kind)
    await form.getByRole('button', { name: 'Add', exact: true }).click()
  }
  const resize = instrument.locator('[data-kind="knob"] [aria-label^="Resize "]').last()
  await resize.click()
  await resize.click()
  await instrument.getByRole('button', { name: 'Done', exact: true }).click()
  await fromMenu(page, lead, 'Pin panel', 'Instrument')
  await fromMenu(page, lead, 'Pin panel', 'Effects')
  await fromMenu(page, session.getByRole('button', { name: 'Master', exact: true }), 'Pin effects panel')
  await show(page, 'Arrangement')
}

const setUp = async (page, url) => {
  await page.goto(`${url}/?starter`)
  await show(page, 'Arrangement')
  const lanes = page.locator('[data-view="arrangement"] [data-lane], main [data-lane]')
  for (const [lane, x] of [[0, 40], [0, 240], [1, 40]]) {
    await lanes.nth(lane).click({ button: 'right', position: { x, y: 20 } })
    // The lane's *Add clip* ▸ submenu: its first session clip.
    await page.getByRole('menuitem', { name: 'Add clip', exact: true }).click()
    await page.getByRole('menu').last().getByRole('menuitem').first().click()
  }
  if (SETUP === 'all') {
    for (const title of ['Instrument', 'Effects', 'Notes', 'Clip', 'Samples', 'Sounds', 'Library']) await show(page, title)
    // Sounds sits in a sidebar since round 3, and Library since round 4, so showing the others leaves them open:
    // collapse their sidebars again. (Before round 4 this collapses the panel on Library; showing Mixer expands it.)
    for (const title of ['Sounds', 'Library']) {
      if (await page.locator(`[data-view="${title.toLowerCase()}"]`).isVisible()) await page.getByRole('tab', { name: title, exact: true }).click()
    }
  }
  if (SETUP === 'four') {
    await dock(page, 'Session', 'arrangement', 0.1, 0.5)
    await page.getByRole('button', { name: 'Edit Root', exact: true }).click()
    await page.waitForTimeout(300)
    await dock(page, 'Clip', 'session', 0.5, 0.9)
    await show(page, 'Mixer')
    await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  } else if (SETUP === 'groups') {
    await dock(page, 'Session', 'arrangement', 0.1, 0.5)
    await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Tracks', exact: true }).click()
    const tree = page.getByRole('tree', { name: 'Tracks' })
    for (const name of ['Lead', 'Pad']) {
      await tree.getByRole('treeitem', { name, exact: true }).click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Group', exact: true }).click()
    }
    // Round 8: the expanded group sums to a bus, so its strip and meter join the mixer.
    const bus = tree.getByRole('treeitem', { name: 'Group 1, group of 1 track', exact: true })
    await bus.click({ button: 'right' })
    const sum = page.getByRole('menuitem', { name: 'Sum to a bus', exact: true })
    if (await sum.count()) await sum.click()
    else await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Collapse Group 2', exact: true }).first().click()
    await tree.getByRole('treeitem', { name: 'Bass', exact: true }).hover()
    await page.getByRole('button', { name: 'Hide Bass', exact: true }).click()
    await show(page, 'Mixer')
    await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  } else if (SETUP === 'wave' || SETUP === 'wave-split' || SETUP === 'wave-spectrum') {
    await show(page, 'Samples')
    await page.locator('[data-view="samples"]').getByRole('button', { name: 'Add demo samples', exact: true }).click()
    const loop = page.locator('[data-view="samples"]').getByRole('listitem').filter({ hasText: 'Demo Drum Loop' })
    await loop.locator('[data-status="ready"]').waitFor()
    await loop.getByRole('button', { name: '✎', exact: true }).click()
    const wave = page.locator('[data-view="wave"]')
    const detail = wave.getByTestId('wave-detail')
    await detail.waitFor()
    // A few marks: markers at 30 and 60 %, a region and the loop from 40 to 50 %; then the cursor back at the start.
    const box = await detail.boundingBox()
    const y = box.y + box.height / 2
    for (const at of [0.3, 0.6]) {
      await page.mouse.click(box.x + box.width * at, y)
      await page.keyboard.press('m')
    }
    await page.mouse.move(box.x + box.width * 0.4, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, y, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.press('r')
    await page.keyboard.press('l')
    await page.mouse.click(box.x + 1, y)
    if (SETUP === 'wave-split') {
      await wave.getByRole('button', { name: 'View', exact: true }).click()
      await page.getByRole('menuitemcheckbox', { name: 'Second pane', exact: true }).click()
      await wave.getByTestId('wave-pane-second').getByTestId('wave-detail').waitFor()
      // The first pane, smaller now, active again, so ▶ plays from its cursor at the start.
      const first = await wave.getByTestId('wave-pane-main').getByTestId('wave-detail').boundingBox()
      await page.mouse.click(first.x + 1, first.y + first.height / 2)
    }
    if (SETUP === 'wave-spectrum') {
      await wave.getByRole('button', { name: 'View', exact: true }).click()
      await page.getByRole('menuitemcheckbox', { name: 'Spectrogram', exact: true }).click()
      await page.waitForFunction(() => /^(levels|stretched|on-demand)$/.test(document.querySelector('[data-view="wave"] [data-testid="wave-detail"]')?.getAttribute('data-spectrum') ?? ''))
      const lanes = await detail.first().boundingBox()
      await page.mouse.move(lanes.x + lanes.width * 0.1, lanes.y + lanes.height * 0.1)
      await page.mouse.down()
      await page.mouse.move(lanes.x + lanes.width * 0.9, lanes.y + lanes.height * 0.4, { steps: 4 })
      await page.mouse.up()
      await page.waitForFunction(() => document.querySelector('[data-view="wave"] [data-testid="wave-detail"]')?.hasAttribute('data-band'))
    }
    await show(page, 'Mixer')
    await wave.getByRole('button', { name: 'Loop', exact: true }).click()
    await wave.getByRole('button', { name: /^Play (from cursor|selection)$/ }).click()
  } else {
    if (SETUP === 'pinned') await pinPanels(page)
    if (SETUP === 'loop') {
      const arrangement = page.locator('[data-view="arrangement"]')
      const ruler = arrangement.getByTestId('arrangement-ruler')
      // 24 px a beat: markers on bars 1, 3 and 5, then the brace drawn over bar 1 in the mark lane and turned on.
      // On the bar grid, so a click a few pixels in (clear of the header splitter) lands on the bar.
      await arrangement.getByLabel('Grid').selectOption('bar')
      for (const beat of [0, 8, 16]) {
        await ruler.click({ position: { x: beat * 24 + 6, y: 10 } })
        await arrangement.getByRole('button', { name: '+ Marker', exact: true }).click()
      }
      await ruler.click({ position: { x: 6, y: 10 } })
      const lane = await arrangement.getByTestId('arrangement-marks').boundingBox()
      // From the bar's end back to its start: the first marker's flag covers the start.
      await page.mouse.move(lane.x + 4 * 24 - 6, lane.y + lane.height / 2)
      await page.mouse.down()
      await page.mouse.move(lane.x + 6, lane.y + lane.height / 2, { steps: 4 })
      await page.mouse.up()
      await arrangement.getByRole('button', { name: '⟳ Loop', exact: true }).click()
      const brace = arrangement.getByTestId('arrangement-loop-brace')
      if (await brace.getAttribute('data-enabled') !== 'true' || await arrangement.getByTestId('arrangement-marker').count() !== 3) throw new Error('The loop setup did not take')
    }
    await show(page, 'Mixer')
    await page.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  }
  await page.waitForTimeout(2000)
}

const main = async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })

  // React commits and render time, dev build.
  {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    await page.addInitScript(hook)
    await setUp(page, devUrl)
    const visible = await page.evaluate(() => [...document.querySelectorAll('[data-view]')].filter((view) => view.checkVisibility()).map((view) => view.dataset.view))
    const busStrips = await page.locator('[data-view="mixer"] section[aria-label$=" bus"]').count()
    const pins = await page.locator('[data-view="pinned"] section[aria-label]').count()
    await page.evaluate(() => { window.__profile.recording = true })
    await page.waitForTimeout(SECONDS * 1000)
    const stats = await page.evaluate(() => { window.__profile.recording = false; return window.__profile })
    const top = Object.entries(stats.byName).sort((a, b) => b[1] - a[1]).slice(0, 12)
    console.log(JSON.stringify({
      build: 'dev',
      setup: SETUP,
      visible,
      busStrips,
      pins,
      commitsPerSecond: +(stats.commits / SECONDS).toFixed(1),
      renderMsPerSecond: +(stats.renderMs / SECONDS).toFixed(1),
      componentRendersPerSecond: Math.round(stats.rendered / SECONDS),
      topRendersPerSecond: Object.fromEntries(top.map(([name, n]) => [name, Math.round(n / SECONDS)])),
      watchedRendersPerSecond: Object.fromEntries(WATCHED.map((name) => [name, Math.round((stats.byName[name] ?? 0) / SECONDS)])),
    }, null, 2))
    await page.close()
  }

  // Main-thread time, production build (Chrome's own counters, no React instrumentation).
  {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    await setUp(page, previewUrl)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const before = await read()
    await page.waitForTimeout(SECONDS * 1000)
    const after = await read()
    const perSecond = (name, scale = 1000) => +(((after[name] - before[name]) * scale) / SECONDS).toFixed(1)
    console.log(JSON.stringify({
      build: 'production',
      setup: SETUP,
      scriptMsPerSecond: perSecond('ScriptDuration'),
      taskMsPerSecond: perSecond('TaskDuration'),
      layoutMsPerSecond: perSecond('LayoutDuration'),
      styleMsPerSecond: perSecond('RecalcStyleDuration'),
    }, null, 2))
    await page.close()
  }
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
