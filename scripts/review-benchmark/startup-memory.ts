/** Separate RSS diagnostic: polling adds load, so this is never a callback-capacity acceptance run. */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { exampleProjects } from '../../src/core/examples/index.ts'
import { serializeProject } from '../../src/core/persistence/index.ts'
const scenario = process.env.MEMORY_SCENARIO ?? 'low'
const url = process.env.MEMORY_URL ?? 'http://127.0.0.1:4173'
const project = exampleProjects[scenario === 'glass' ? 1 : 0]!.create()
const rendererMemory = () => {
  const rows = execFileSync('ps', ['-Ao', 'pid,ppid,rss,command'], { encoding: 'utf8' }).split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), rssKiB: Number(match[3]), command: match[4]! }] : []
  })
  const descendants = new Set([process.pid])
  for (let pass = 0; pass < rows.length; pass++) {
    const previous = descendants.size
    for (const row of rows) if (descendants.has(row.parent)) descendants.add(row.pid)
    if (descendants.size === previous) break
  }
  return rows.filter(row=>descendants.has(row.pid) && row.command.includes('--type=renderer')).map(({ pid, rssKiB })=>({ pid, rssKiB }))
}
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
let timer: ReturnType<typeof setInterval> | undefined
try {
  const page = await browser.newPage()
  const bundles: Record<string, string> = {}, responses: Promise<void>[] = []
  page.on('response', response => {
    if (/\/engine-processor-[^/]+\.js$/.test(response.url())) responses.push((async () => {
      bundles[response.url()] = createHash('sha256').update(await response.body()).digest('hex')
    })())
  })
  await page.addInitScript(saved => {
    localStorage.setItem('sfxlab:project', saved)
    ;(window as any).__startupMemory = { readyMs: null, firstStatusMs: null }
    const Native = AudioWorkletNode
    window.AudioWorkletNode = class extends Native {
      constructor(c: BaseAudioContext, n: string, o?: AudioWorkletNodeOptions) {
        super(c,n,o)
        const start = performance.now()
        this.port.addEventListener('message', ({ data }) => {
          if (data.kind === 'ready') (window as any).__startupMemory.readyMs = performance.now()-start
          if (data.kind === 'status') (window as any).__startupMemory.firstStatusMs ??= performance.now()-start
        }); this.port.start()
      }
    }
  }, serializeProject(project))
  await page.goto(url)
  const start = Date.now(), samples: { elapsedMs: number; renderers: ReturnType<typeof rendererMemory> }[] = []
  const sample = () => samples.push({ elapsedMs: Date.now()-start, renderers: rendererMemory() })
  sample()
  if (!samples[0]!.renderers.length) throw Error('No descendant renderer processes found')
  timer = setInterval(sample,25)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(() => (window as any).__startupMemory.firstStatusMs !== null, undefined, { timeout: 30000 })
  await page.waitForTimeout(3000)
  clearInterval(timer); timer = undefined; sample()
  const totals = samples.map(s=>s.renderers.reduce((n,r)=>n+r.rssKiB,0))
  await Promise.all(responses)
  const report = { scenario, url, browser: browser.version(), intervalMs: 25,
    harnessSHA256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'), bundles,
    note: 'Sampled whole renderer RSS, including DOM/runtime, actual and temporary engines. Peak is a sampled lower bound; allocator retention is not live JS heap. Polling adds load; not capacity or authoritative latency evidence.',
    timing: await page.evaluate(()=>(window as any).__startupMemory), baselineKiB: totals[0], peakKiB: Math.max(...totals), endKiB: totals.at(-1), samples }
  writeFileSync(process.argv[2] ?? '/private/tmp/sfx-startup-memory.json', JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({ ...report, samples: report.samples.length },null,2))
} finally { if (timer) clearInterval(timer); await browser.close() }
