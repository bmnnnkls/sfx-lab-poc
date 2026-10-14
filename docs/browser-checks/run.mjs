// Runs the browser checks against a production build: `npm run check:smoke` for the quick set, `npm run check:browser` for all.
//
//   node docs/browser-checks/run.mjs [--smoke] [--no-build] [--jobs N] [--out DIR] [name ...]
//
// Builds the app (unless --no-build), serves it with `vite preview` on :4173 (or reuses a server already there), runs the scripts
// a few at a time, each in its own browser, and prints one line per script and a summary. Exits 1 when a check prints FAIL, a
// script crashes or times out, or a script prints no PASS at all.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const URL = 'http://localhost:4173/'
const TIMEOUT_MS = 6 * 60_000

/**
 * The quick set before a push, about a minute: the examples playing (real audio), the picker, the panel, the piano roll's
 * menus, Randomize, the card pictures and the WAV export. The full run is for a change to one of the other areas, or a release.
 */
const SMOKE = ['showcase', 'quickadd', 'panel', 'menu', 'randomize', 'previews', 'export']
/** Helpers imported by the scripts, not scripts themselves. */
const LIBRARIES = new Set(['run', 'registry', 'audio-tap'])

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}
const valued = new Set([option('--jobs'), option('--out')].filter(Boolean))
const named = args.filter((arg) => !arg.startsWith('--') && !valued.has(arg))
const all = readdirSync(HERE).filter((file) => file.endsWith('.mjs')).map((file) => basename(file, '.mjs')).filter((name) => !LIBRARIES.has(name)).sort()
const unknown = named.filter((name) => !all.includes(name))
if (unknown.length > 0) {
  console.error(`No such check: ${unknown.join(', ')}. Known: ${all.join(', ')}`)
  process.exit(2)
}
const scripts = named.length > 0 ? named : flag('--smoke') ? SMOKE : all
const jobs = Math.max(1, Number(option('--jobs', '3')) || 3)
const out = option('--out', join(tmpdir(), 'sfxlab-browser-checks'))
mkdirSync(out, { recursive: true })

const isUp = async () => {
  try {
    return (await fetch(URL)).ok
  } catch {
    return false
  }
}

if (!flag('--no-build')) {
  console.log('Building…')
  const build = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

let server = null
if (await isUp()) {
  console.log(`Reusing the server already at ${URL} (it may serve an older build).`)
} else {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true })
  for (let tries = 0; !(await isUp()); tries++) {
    if (tries > 100) throw new Error('vite preview did not start')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
const stopServer = () => {
  if (server) {
    try {
      process.kill(-server.pid)
    } catch {}
  }
}
process.on('SIGINT', () => {
  stopServer()
  process.exit(130)
})

const runOne = (name) =>
  new Promise((resolve) => {
    const started = Date.now()
    const dir = join(out, name)
    mkdirSync(dir, { recursive: true })
    const child = spawn(process.execPath, [join(HERE, `${name}.mjs`), dir], { cwd: ROOT })
    let output = ''
    child.stdout.on('data', (data) => (output += data))
    child.stderr.on('data', (data) => (output += data))
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const lines = output.split('\n')
      const passed = lines.filter((line) => line.startsWith('PASS')).length
      const failed = lines.filter((line) => line.startsWith('FAIL'))
      const timedOut = signal === 'SIGKILL'
      const ok = code === 0 && !timedOut && failed.length === 0 && passed > 0
      resolve({ name, ok, passed, failed, code, timedOut, seconds: (Date.now() - started) / 1000, output })
    })
  })

console.log(`Running ${scripts.length} check${scripts.length === 1 ? '' : 's'}, ${jobs} at a time; screenshots in ${out}`)
const started = Date.now()
const queue = [...scripts]
const results = []
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const result = await runOne(name)
      results.push(result)
      const status = result.ok ? 'ok  ' : 'FAIL'
      const why = result.timedOut ? ' (timed out)' : result.code !== 0 ? ` (exit ${result.code})` : result.passed === 0 ? ' (no PASS printed)' : ''
      console.log(`${status} ${name.padEnd(16)} ${String(result.passed).padStart(3)} passed, ${result.failed.length} failed, ${result.seconds.toFixed(0)} s${why}`)
    }
  }),
)
stopServer()

const bad = results.filter((result) => !result.ok)
for (const result of bad) {
  console.log(`\n--- ${result.name} ---`)
  const failures = result.failed.length > 0 ? result.failed.join('\n') : result.output.split('\n').slice(-15).join('\n')
  console.log(failures)
}
const checks = results.reduce((sum, result) => sum + result.passed, 0)
console.log(`\n${results.length - bad.length}/${results.length} scripts ok, ${checks} checks passed, ${((Date.now() - started) / 1000).toFixed(0)} s`)
process.exit(bad.length > 0 ? 1 : 0)
