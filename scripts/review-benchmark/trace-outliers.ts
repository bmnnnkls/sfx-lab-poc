/** Retain wall deadlines, adding native trace thread-clock diagnostics where available. */
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
interface Event { pid: number; tid: number; ts: number; tts?: number; args?: { data?: { message?: string } } }
const directory = process.argv[2]
if (!directory) throw Error('Pass a capacity capture directory')
const report = JSON.parse(readFileSync(`${directory}/report.json`, 'utf8'))
const events: Event[] = JSON.parse(gunzipSync(readFileSync(`${directory}/trace.json.gz`)).toString()).traceEvents
const budgetMs = Math.min(...report.traffic.report.quanta) / report.traffic.report.rate * 1000
const rows = []
const threadDistributions = []
const distribution = (values: number[]) => {
  values.sort((a,b)=>a-b)
  return { count: values.length, p50: values[Math.floor(values.length*.5)], p95: values[Math.floor(values.length*.95)], p99: values[Math.floor(values.length*.99)], max: values.at(-1) }
}
for (const label of ['engine', 'callback']) {
  const starts = new Map<string, Event>()
  const threadTimes: number[] = []
  let first: number | undefined
  for (const event of events) {
    const message = event.args?.data?.message, key = `${event.pid}:${event.tid}`
    if (message === `F1:${label}:start`) { starts.set(key, event); first ??= event.ts }
    if (message !== `F1:${label}:end`) continue
    const start = starts.get(key)
    if (!start) continue
    starts.delete(key)
    const wallMs = (event.ts - start.ts) / 1000
    const threadMs = event.tts !== undefined && start.tts !== undefined ? (event.tts - start.tts) / 1000 : undefined
    if (threadMs !== undefined) threadTimes.push(threadMs)
    if (wallMs <= budgetMs) continue
    rows.push({ label, relativeSeconds: (start.ts - first!) / 1e6, wallMs, threadMs,
      nonThreadMs: threadMs === undefined ? undefined : wallMs - threadMs,
      note: 'Thread clock excludes time not executing on this thread; it does not identify the external cause. Wall deadline still failed.' })
  }
  threadDistributions.push({ label, threadMs: distribution(threadTimes) })
}
writeFileSync(`${directory}/thread-clock-outliers.json`, JSON.stringify({ budgetMs, threadDistributions, rows }, null, 2) + '\n')
console.log(`${directory}: retained ${rows.length} wall overruns with thread-clock diagnostics`)
