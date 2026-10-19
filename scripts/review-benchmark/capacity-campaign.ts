/** Serial capacity captures, with a stop marker checked between complete, restored captures. */
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, process.env.CAPACITY_CAMPAIGN_OUTPUT ?? 'docs/measurements/f1-fix/startup/final')
mkdirSync(output, { recursive: true })
const scenarios = [
  ['constant',65,'low-notes','steady'],
  ['continuous',65,'low-continuous-notes','interactive'],
  ['low-arrangement',120,'low','arrangement'],
  ['glass-arrangement',310,'glass','arrangement'],
] as const
for (const [name,seconds,scenario,activity] of scenarios) {
  if (existsSync(resolve(output,'STOP'))) { console.log(`Stopped before ${name}; completed captures are retained.`); break }
  const log = openSync(resolve(output,`${name}-console.txt`),'w')
  try {
    const child = spawnSync(process.execPath, ['--experimental-transform-types','--disable-warning=ExperimentalWarning','--import','./scripts/review-benchmark/loader.mjs','scripts/review-benchmark/worklet-capacity.ts'], {
      cwd: root, env: { ...process.env, CAPACITY_SECONDS: String(seconds), CAPACITY_SCENARIO: scenario, CAPACITY_ACTIVITY: activity, CAPACITY_OUTPUT: resolve(output,name) },
      stdio: ['ignore',log,log],
    })
    if (child.error) throw child.error
    if (child.status !== 0) throw Error(`${name} exited ${child.status} (${child.signal ?? 'no signal'})`)
  } finally { closeSync(log) }
  console.log(`${name} complete`)
}
