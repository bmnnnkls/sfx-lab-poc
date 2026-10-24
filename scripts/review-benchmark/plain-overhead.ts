/** Diagnostic for the repeated one-track no-lane regression; does not change acceptance thresholds. */
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import os from 'node:os'
const root = resolve(process.env.ENGINE_SOURCE_ROOT ?? '.')
const load = (path: string) => import(pathToFileURL(`${root}/src/core/${path}`).href)
const { Engine } = await load('engine/engine.ts')
const { createEmptyProject, createClip, createNote } = await load('project/index.ts')
const { noteGraphFrom } = await load('patch/index.ts')
const { diffProject } = await load('sync/index.ts')
const p = createEmptyProject(), base = p.tracks[0], id = 't0'
const patch = noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'osc', type: 'oscillator' }, { id: 'out', type: 'output' }], ['note.frequency>osc.freq', 'osc.out>out.in'])
const graph = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'tr', type: 'transpose', params: { semitones: 0 } }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in'])
const project = { ...p, tracks: [{ ...base, id, voices: 4, patch, noteGraph: graph, clips: [{ ...createClip('held', 100, [createNote(60, 0, 100, .5)]), id: 'c0' }] }] }
const engine = new Engine(48000)
for (const command of diffProject(null, project)) engine.apply(command)
engine.apply({ type: 'scene/launch', scene: 0 })
const l = new Float32Array(128), r = new Float32Array(128)
const render = (seconds: number) => { for (let i = 0; i < seconds * 375; i++) engine.render(l, r) }
render(10)
const times: number[] = []
const loadBefore = os.loadavg()
for (let trial = 0; trial < 20; trial++) {
  const t = performance.now(); render(10); times.push((performance.now() - t) / 10)
}
const ordered = [...times].sort((a,b) => a-b)
const report = { root, cpu: os.cpus()[0]?.model, loadBefore, loadAfter: os.loadavg(), secondsPerTrial: 10, trials: 20, warmSeconds: 10, millisecondsPerAudioSecond: times, median: (ordered[9]! + ordered[10]!) / 2 }
if (process.env.DIAGNOSTIC_OUTPUT) writeFileSync(process.env.DIAGNOSTIC_OUTPUT, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
