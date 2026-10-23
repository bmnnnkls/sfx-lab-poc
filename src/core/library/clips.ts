import { controlGraph, enumerateControlTargets, resolveControlTarget, type ControlOwner, type ControlTarget } from '../control'
import { flattenPatch } from '../patch'
import type { Project, Track } from '../project'
import { compareCodeUnits, createId } from '../shared'
import { saveLibraryItem } from './catalog'
import type { LibraryCatalog, LibraryItem, PortableLane } from './types'

/** Graph identity independent of author IDs. Preserve topology/configuration guards, ignore sound values and labels. */
const graphShape = (project: Project, owner: ControlOwner, domain: 'patch' | 'fx' | 'notes') => {
  const graph = controlGraph(project, owner, domain)
  if (!graph) return undefined
  const flat = flattenPatch(graph, project.modules), index = (id: string) => flat.nodes.findIndex(n => n.id === id)
  return { flat, signature: JSON.stringify([flat.nodes.map(n => [n.type, n.stereo ?? false, n.bypassed ?? false, ['control', 'xy', 'switch', 'selector'].includes(n.type) ? Object.entries(n.params).filter(([key]) => !['value', 'x', 'y', 'on', 'index'].includes(key)).sort() : null]), flat.connections.map(c => [index(c.from.node), c.from.port, index(c.to.node), c.to.port]).sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)))]) }
}
export const captureLibraryClip = (catalog: LibraryCatalog, project: Project, trackId: string, clipId: string, name: string, folderId: string | null): LibraryCatalog => {
  const track = project.tracks.find(t => t.id === trackId)
  if (!track || track.kind === 'return') throw new Error('Select a MIDI or audio clip')
  const clip = track.clips.find(c => c?.id === clipId)
  if (!clip) throw new Error('Select a clip')
  const lanes: PortableLane[] = (clip.automation ?? []).map(lane => {
    if (lane.target.owner.kind !== 'track' || lane.target.owner.trackId !== trackId || (lane.target.kind === 'mixer' && lane.target.control === 'send' || lane.target.kind === 'graph' && ['send', 'trackAudio', 'trackNotes'].includes(lane.target.nodeType))) throw new Error('Clip contains unresolved external routing: remove send/cross-owner automation before saving')
    const { owner: _owner, ...target } = lane.target
    if (lane.target.kind === 'mixer') return { ...lane, target }
    const shape = graphShape(project, lane.target.owner, lane.target.domain)
    const nodeId = [...lane.target.path.map(p => p.nodeId), lane.target.nodeId].join('/')
    const nodeIndex = shape?.flat.nodes.findIndex(n => n.id === nodeId) ?? -1
    if (!shape || nodeIndex < 0) throw new Error('Clip automation target is unavailable')
    return { ...lane, target, graphSignature: shape.signature, nodeIndex }
  })
  const { automation: _automation, ...saved } = clip
  const content = track.kind === 'instrument' && 'notes' in saved ? { kind: 'midi-clip' as const, clip: saved, lanes } : !('notes' in saved) ? { kind: 'audio-clip' as const, clip: saved, lanes } : undefined
  if (!content) throw new Error('Clip kind mismatch')
  const sampleId = content.kind === 'audio-clip' ? content.clip.sampleId : undefined
  const sample = project.samples.find(s => s.id === sampleId)
  if (sampleId && !sample) throw new Error('Audio clip sample metadata is missing')
  const next = { ...catalog, samples: sample && !catalog.samples.some(s => s.id === sample.id) ? [...catalog.samples, sample] : catalog.samples }
  return saveLibraryItem(next, { id: createId('item'), name, folderId, content })
}
export const insertLibraryClip = (project: Project, catalog: LibraryCatalog, item: LibraryItem, trackId: string, scene: number, replace = false) => {
  const content = item.content, track = project.tracks.find(t => t.id === trackId)
  if (content.kind !== 'midi-clip' && content.kind !== 'audio-clip') throw new Error('Choose a clip')
  if (!track || track.kind === 'return' || (track.kind === 'instrument') !== (content.kind === 'midi-clip')) throw new Error('Choose a matching MIDI/audio track')
  if (!Number.isInteger(scene) || scene < 0 || scene >= project.sceneCount) throw new Error('Choose a valid scene')
  if (track.clips[scene] && !replace) throw new Error('Slot is occupied; choose explicit Replace clip')
  if (content.kind === 'audio-clip' && ![...project.samples, ...catalog.samples].some(s => s.id === content.clip.sampleId)) throw new Error('Audio clip sample metadata is missing')
  const issues: string[] = [], owner: ControlOwner = { kind: 'track', trackId }
  const automation = content.lanes.flatMap(lane => {
    if (lane.target.kind === 'mixer' && lane.target.control === 'send' || lane.target.kind === 'graph' && ['send', 'trackAudio', 'trackNotes'].includes(lane.target.nodeType)) { issues.push(`Lane ${lane.id}: unresolved external routing; lane was not inserted`); return [] }
    let target: ControlTarget | undefined
    if (lane.target.kind === 'mixer') target = { ...lane.target, owner } as ControlTarget
    else {
      const shape = graphShape(project, owner, lane.target.domain)
      const portable = lane.target
      if (shape && shape.signature === lane.graphSignature) {
        const flattenedId = shape.flat.nodes[lane.nodeIndex ?? -1]?.id
        target = enumerateControlTargets(project).find(t => t.kind === 'graph' && t.owner.kind === 'track' && t.owner.trackId === trackId && t.domain === portable.domain && t.paramId === portable.paramId && t.nodeType === portable.nodeType && [...t.path.map(p => p.nodeId), t.nodeId].join('/') === flattenedId)
      }
    }
    const resolved = target && resolveControlTarget(project, target)
    if (!target || resolved?.status !== 'available' || !resolved.automatable) { issues.push(`Lane ${lane.id}: destination is incompatible; lane was not inserted`); return [] }
    return [{ id: createId('lane'), target, enabled: lane.enabled, points: lane.points.map(p => ({ ...p, id: createId('point') })) }]
  })
  const id = createId('clip')
  const clip = { ...content.clip, id, name: item.name.slice(0, 40), ...(automation.length && { automation }), ...('notes' in content.clip && { notes: content.clip.notes.map(n => ({ ...n, id: createId('note') })) }) }
  const samples = content.kind === 'audio-clip' ? catalog.samples.filter(s => s.id === content.clip.sampleId && !project.samples.some(p => p.id === s.id)) : []
  const next: Project = { ...project, samples: [...project.samples, ...samples], tracks: project.tracks.map(t => t.id === trackId && t.kind !== 'return' ? { ...t, clips: t.clips.map((c, i) => i === scene ? clip : c) } as Track : t), libraryOrigins: [...(project.libraryOrigins ?? []), { itemId: item.id, trackId, clipId: id }] }
  if ((next.libraryOrigins?.length ?? 0) > 4096) throw new Error('Project library origin limit reached (4096)')
  if (next.samples.length > 256) throw new Error('Project sample limit reached')
  return { project: next, issues }
}
export const captureLibrarySample = (catalog: LibraryCatalog, project: Project, sampleId: string, name: string, folderId: string | null) => {
  const sample = project.samples.find(s => s.id === sampleId)
  if (!sample) throw new Error('Choose a project sample')
  return saveLibraryItem({ ...catalog, samples: catalog.samples.some(s => s.id === sampleId) ? catalog.samples : [...catalog.samples, sample] }, { id: createId('item'), name, folderId, content: { kind: 'sample', sampleId } })
}
