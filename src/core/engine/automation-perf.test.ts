import { expect, it } from 'vitest'
import { exampleProjects } from '../examples'
import { Engine } from './engine'
import { diffProject } from '../sync'
it('renders a dense Low Light scene with an automated mixer lane through normal blocks', () => {
  const p = exampleProjects[0]!.create()
  const t = p.tracks.find((t) => t.kind === 'instrument')!
  if (t.kind !== 'instrument') return
  const project = { ...p, tracks: p.tracks.map((track) => track.id !== t.id ? track : { ...t, clips: t.clips.map((c) => c && ({ ...c, automation: [{ id: 'l', enabled: true, target: { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: t.id }, control: 'volume' as const }, points: [{ id: 'p', beat: 0, value: 0, interpolation: 'linear' as const }, { id: 'p1', beat: 4, value: 1, interpolation: 'linear' as const }] }] })) }) }
  const e = new Engine(48000); diffProject(null, project).forEach((c) => e.apply(c)); e.apply({ type: 'scene/launch', scene: 6 })
  const l = new Float32Array(4800)
  e.render(l, new Float32Array(l.length))
  expect(l.every(Number.isFinite)).toBe(true)
  expect(Math.max(...l.map(Math.abs))).toBeGreaterThan(0.02)
  expect(e.status().automation).toHaveLength(1)
})
