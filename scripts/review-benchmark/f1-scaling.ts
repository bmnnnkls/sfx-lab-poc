/** Separate scaling probes, not support promises or substitutes for the named Low Light gate. */
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import { Engine } from '../../src/core/engine/engine.ts'
import { diffProject } from '../../src/core/sync/index.ts'
import { createEmptyProject, createClip, createNote, type InstrumentTrack, type Project } from '../../src/core/project/index.ts'
import { noteGraphFrom } from '../../src/core/patch/index.ts'
interface Shape { tracks: number; voices: number; active: number; lanes: number; points: number; inactiveClips: number }
const cases: Shape[] = [
  { tracks: 32, voices: 4, active: 1, lanes: 1, points: 2, inactiveClips: 0 },
  ...[4,16].flatMap(voices => [0,1,voices].map(active => ({ tracks: 4, voices, active, lanes: 1, points: 2, inactiveClips: 0 }))),
  ...[1,8,64].flatMap(lanes => [2,2048].map(points => ({ tracks: 4, voices: 4, active: 1, lanes, points, inactiveClips: 0 }))),
  ...[0,64,512].map(inactiveClips => ({ tracks: 4, voices: 4, active: 1, lanes: 1, points: 2, inactiveClips })),
]
const projectOf = (shape: Shape): Project => {
  const p = createEmptyProject(), base = p.tracks[0] as InstrumentTrack
  const patch = noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'osc', type: 'oscillator' }, { id: 'out', type: 'output' }], ['note.frequency>osc.freq', 'osc.out>out.in'])
  const nodes = [{ id: 'in', type: 'clipNotes' }, ...Array.from({ length: shape.lanes }, (_,i) => ({ id: `tr${i}`, type: 'transpose' })), { id: 'out', type: 'noteOut' }]
  const graph = noteGraphFrom(nodes, nodes.slice(1).map((node,i)=>`${nodes[i]!.id}.out>${node.id}.in`))
  return { ...p, sceneCount: shape.inactiveClips + 1, tracks: Array.from({ length: shape.tracks }, (_,i) => ({ ...base, id: `t${i}`, voices: shape.voices, patch, noteGraph: graph,
    clips: [{ ...createClip('active', 100, Array.from({ length: shape.active }, (_,j)=>({ ...createNote(48 + j, 0, 100, .2), id: `note${j}` }))), id: `c${i}`,
      automation: i ? [] : Array.from({ length: shape.lanes }, (_,j) => ({ id: `lane${j}`, enabled: true, target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: `t${i}` }, domain: 'notes' as const, path: [], nodeId: `tr${j}`, nodeType: 'transpose', paramId: 'semitones' }, points: Array.from({ length: shape.points }, (_,k)=>({ id: `p${k}`, beat: k / (shape.points - 1) * 100, value: .5 + .02 * Math.sin(k), interpolation: 'linear' as const })) })) },
      ...Array.from({ length: shape.inactiveClips }, (_,j)=>({ ...createClip('inactive', 100, []), id: `inactive${i}-${j}` })),
    ],
  })) }
}
const rate = 48000, frames = 12000 // each finite trial covers exactly .25 audio seconds, including a partial quantum
const l = new Float32Array(frames), r = new Float32Array(frames)
const render = (engine: Engine) => {
  const start = performance.now()
  for (let i = 0; i < frames; i += 128) engine.render(l.subarray(i, Math.min(frames,i+128)),r.subarray(i,Math.min(frames,i+128)))
  const ms = performance.now() - start
  if (!l.every(Number.isFinite) || !r.every(Number.isFinite)) throw Error('Non-finite scaling capture')
  return ms / (frames / rate)
}
const results = []
for (const shape of cases) {
  const start = performance.now(), project = projectOf(shape), engine = new Engine(rate)
  for (const command of diffProject(null, project)) engine.apply(command)
  engine.apply({ type: 'scene/launch', scene: 0 })
  const configureMs = performance.now() - start
  render(engine)
  const trials = Array.from({ length: 5 }, ()=>render(engine)), sorted = [...trials].sort((a,b)=>a-b)
  const row = { shape, configureMs, trialsMsPerAudioSecond: trials, median: sorted[2] }
  results.push(row); console.log(JSON.stringify(row))
}
const report = { cpu: os.cpus()[0]?.model, loadAverage: os.loadavg(), rate, quantum: 128, trialAudioSeconds: frames / rate, trials: 5, warmAudioSeconds: .25, note: 'Engine render plus output-view dispatch; full finite windows checked outside timed interval. Stress characterization only.', results }
if (process.env.SCALING_OUTPUT) writeFileSync(process.env.SCALING_OUTPUT,JSON.stringify(report,null,2)+'\n')
