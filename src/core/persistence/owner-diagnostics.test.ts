import { expect, it } from 'vitest'
import { createEmptyProject, createClip, createAudioClip, createAudioTrack, type InstrumentTrack } from '../project'
import { parseProject, serializeProject } from './project-file'
import { compileAutomation } from '../automation'

it('retains unsupported MIDI/audio lanes and valid unavailable references, warns on duplicate owners without rebinding', async () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const sample = { id: 'a'.repeat(64), name: 'A', extension: 'wav', sampleRate: 8000, channels: 1, bytes: 44, durationSeconds: 1 }
  const lane = { id: 'foreign', enabled: true, target: { kind: 'mixer' as const, owner: { kind: 'master' as const }, control: 'volume' as const }, points: [{ id: 'p', beat: 0, value: 0.5, interpolation: 'hold' as const }] }
  const unavailable = { ...lane, id: 'missing', target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: t.id }, domain: 'patch' as const, path: [], nodeId: 'missing', nodeType: 'control', paramId: 'value' } }
  const audio = createAudioTrack('A', p.sceneCount)
  const clip = { ...createClip('C', 4, []), automation: [lane, unavailable] }
  const input = { ...p, samples: [sample], tracks: [{ ...t, clips: [clip] }, { ...t, clips: [{ ...clip, id: 'duplicate' }] }, { ...audio, clips: [{ ...createAudioClip(sample, 120), automation: [lane] }] }] }
  const r = parseProject(serializeProject(input)); expect(r.ok).toBe(true); if (!r.ok) return
  expect(r.warnings.some(w => w.includes('duplicate owner ID') && w.includes('ambiguous'))).toBe(true)
  expect(r.warnings.filter(w => w.includes('Unsupported automation owner'))).toHaveLength(4)
  expect(r.project.tracks[1]!.id).not.toBe(t.id)
  const first = r.project.tracks[0] as InstrumentTrack
  expect(first.clips[0]!.automation).toEqual([lane, unavailable])
  expect(compileAutomation(r.project).flatMap(t => t.clips).filter(Boolean)).toEqual([])
  const { exportProject, importProject } = await import('../../storage')
  const exported = await exportProject(r.project, async () => undefined), imported = await importProject(exported.bytes)
  expect(imported.ok && imported.project).toEqual(r.project)
  if (imported.ok) expect(imported.warnings.some(w => w.includes('Unsupported automation owner'))).toBe(true)
  const reload = parseProject(serializeProject(r.project)); expect(reload.ok && reload.project).toEqual(r.project)
})
