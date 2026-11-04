// Long tasks while scrolling and zooming a 4096-beat arrangement at the closest zoom (256 px a beat): a region at beat
// 4000 and one at 0, five seconds of sideways wheel scrolls and ⌘-wheel zooms out and back in.
//
// Usage: `npm run build && npx vite preview --port 4288`, then `node scripts/measure-long-timeline.cjs http://localhost:4288`.
// Prints the lane's width in pixels, the long tasks (over 50 ms, by the browser's definition) and the longest.
const { chromium } = require('@playwright/test')
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(`${url}/?starter`)
  await page.waitForTimeout(1500)
  // An edit, so autosave writes the project.
  await page.getByLabel('BPM').fill('111')
  await page.waitForFunction(() => localStorage.getItem('sfxlab:project') !== null, null, { timeout: 10000 })
  // A copy of Bass's first clip at beat 4000, through the saved project.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('sfxlab:project'))
    const track = saved.project.tracks[0]
    const clip = track.clips.find(Boolean)
    saved.project.arrangement = [{ id: 'far', trackId: track.id, startBeat: 4000, content: clip }, { id: 'near', trackId: track.id, startBeat: 0, content: clip }]
    localStorage.setItem('sfxlab:project', JSON.stringify(saved))
  })
  await page.reload()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Arrangement view', exact: true }).click()
  const slider = page.getByLabel('Zoom', { exact: true })
  await slider.focus()
  await page.keyboard.press('End')
  const width = await page.locator('[data-lane]').first().evaluate((e) => e.getBoundingClientRect().width)
  await page.evaluate(() => {
    window.__long = []
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__long.push(entry.duration) }).observe({ type: 'longtask', buffered: false })
  })
  const scroller = page.locator('[data-testid="arrangement-view"] [data-scroll]')
  const box = await scroller.boundingBox()
  await page.mouse.move(box.x + 700, box.y + 80)
  const start = Date.now()
  // 5 s: sideways scrolls and ⌘-wheel zooms out and back in, alternating.
  while (Date.now() - start < 5000) {
    for (let i = 0; i < 5; i++) await page.mouse.wheel(400, 0)
    await page.keyboard.down('Control')
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 200)
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
    await page.keyboard.up('Control')
  }
  const long = await page.evaluate(() => window.__long)
  console.log(JSON.stringify({ laneWidthPx: width, longTasks: long.length, longestMs: Math.max(0, ...long), over50: long.filter((d) => d > 50).length }))
  await browser.close()
})()
