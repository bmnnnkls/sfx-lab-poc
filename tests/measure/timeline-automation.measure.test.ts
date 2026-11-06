import { describe, expect, it } from 'vitest'
import {
  type AutomationLane,
  type InstrumentTrack,
  type Project,
  Engine,
  compileAutomation,
  compileTimelineAutomation,
  createArrangementClip,
  createClip,
  createEmptyProject,
  createNote,
  diffProject,
  noteGraphFrom,
  setTimelineLanes,
} from '../../src/core'

/*
 * Round 12c's measure: what timeline automation costs the engine, and what compiling it costs an edit.
 *
 * Run: MEASURE=1 npx vitest run tests/measure/timeline-automation.measure.test.ts
 * Prints one JSON object. Skipped in the normal suite: timings are not assertions.
 *
 * 1. Render time per 128-frame block at 48 kHz, 16 instrument tracks each holding a note for the whole time:
 *    no lanes (arrangement), a volume lane per track on the timeline (arrangement), and the same lanes in a playing
 *    session clip per track (session). Median of 5 runs of 10 s.
 * 2. The compile and the signature `project-sync` makes on every edit, for 16 owners × 4 lanes × 512 points.
 */

const RATE = 48000
const TRACKS = 16
const SECONDS = 10
const BLOCK = 128

const ramp = (trackId: string, control: 'volume' | 'pan', points: number, beats: number, id = `${trackId}-${control}`): AutomationLane => ({
  id,
  target: { kind: 'mixer', owner: { kind: 'track', trackId }, control },
  enabled: true,
  points: Array.from({ length: points }, (_, i) => ({ id: `${id}-${i}`, beat: (i * beats) / points, value: (i % 2) * 0.5 + 0.25, interpolation: 'linear' as const })),
})

/** 16 tracks, each with a note held for 64 beats: as a session clip in scene 1 and as a region at beat 0. */
const base = (sessionLanes: boolean): Project => {
  const p = createEmptyProject()
  const t = p.tracks[0] as InstrumentTrack
  const patch = noteGraphFrom([{ id: 'osc', type: 'oscillator', params: { frequency: 220, waveform: 1 } }, { id: 'out', type: 'output' }], ['osc.out>out.in'])
  const tracks = Array.from({ length: TRACKS }, (_, i): InstrumentTrack => {
    const id = `t${i}`
    const clip = { ...createClip('Held', 64, [createNote(48 + i, 0, 64, 0.5)]), id: `c${i}`, ...(sessionLanes && { automation: [ramp(id, 'volume', 16, 64)] }) }
    return { ...t, id, name: `T${i}`, volume: 0.05, patch, clips: [clip, ...t.clips.slice(1).map(() => null)] }
  })
  return { ...p, tempo: 120, tracks, arrangement: tracks.map((track) => createArrangementClip(track.id, 0, { ...(track.clips[0]!), automation: [] })) }
}

const withTimelineLanes = (project: Project): Project =>
  project.tracks.reduce((next, track) => setTimelineLanes(next, { kind: 'track', trackId: track.id }, [ramp(track.id, 'volume', 16, 64)]), project)

const msPerBlock = (project: Project, mode: 'session' | 'arrangement'): number => {
  const runs: number[] = []
  for (let run = 0; run < 5; run++) {
    const engine = new Engine(RATE)
    diffProject(null, project).forEach((command) => engine.apply(command))
    engine.apply(mode === 'session' ? { type: 'scene/launch', scene: 0 } : { type: 'arrangement/play', fromBeat: 0 })
    const left = new Float32Array(BLOCK), right = new Float32Array(BLOCK)
    for (let i = 0; i < 50; i++) engine.render(left, right) // warm-up
    const blocks = (RATE * SECONDS) / BLOCK
    const start = performance.now()
    for (let i = 0; i < blocks; i++) engine.render(left, right)
    runs.push((performance.now() - start) / blocks)
  }
  return +runs.sort((a, b) => a - b)[2]!.toFixed(4)
}

const editCost = (): { compileMs: number; signatureMs: number; signatureBytes: number } => {
  let project = base(false)
  for (const track of project.tracks) {
    const id = track.id
    project = setTimelineLanes(project, { kind: 'track', trackId: id }, [ramp(id, 'volume', 512, 4000), ramp(id, 'pan', 512, 4000), { ...ramp(id, 'volume', 512, 4000, `${id}-v2`), target: { kind: 'mixer', owner: { kind: 'track', trackId: id }, control: 'send', returnId: 'none' } }, ramp(id, 'pan', 512, 4000, `${id}-p2`)])
  }
  const compiles: number[] = [], signatures: number[] = []
  let bytes = 0
  for (let i = 0; i < 20; i++) {
    const a = performance.now()
    const config = { tracks: compileAutomation(project), timeline: compileTimelineAutomation(project) }
    const b = performance.now()
    bytes = JSON.stringify(config).length
    compiles.push(b - a)
    signatures.push(performance.now() - b)
  }
  const median = (list: number[]) => +list.sort((x, y) => x - y)[10]!.toFixed(2)
  return { compileMs: median(compiles), signatureMs: median(signatures), signatureBytes: bytes }
}

describe.runIf(process.env.MEASURE)('timeline automation measure', () => {
  it('prints the engine cost and the edit cost', () => {
    const none = msPerBlock(base(false), 'arrangement')
    const timeline = msPerBlock(withTimelineLanes(base(false)), 'arrangement')
    const session = msPerBlock(base(true), 'session')
    const sessionNoLanes = msPerBlock(base(false), 'session')
    const edit = editCost()
    process.stdout.write(`${JSON.stringify({ rate: RATE, block: BLOCK, tracks: TRACKS, msPerBlock: { arrangementNoLanes: none, arrangementTimelineLanes: timeline, sessionNoLanes, sessionClipLanes: session }, budgetMs: +((BLOCK / RATE) * 1000).toFixed(3), edit }, null, 2)}\n`)
    expect(timeline).toBeGreaterThan(0)
  }, 600_000)
})
