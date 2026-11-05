import { describe, expect, it } from 'vitest'
import { EFFECT_INPUTS, type LibraryCatalog, type LibraryItem, emptyLibrary, insertLibraryAsset, insertLibraryClip, isFactoryId, saveLibraryFolder, validateLibraryCatalog } from '../../library'
import { randomizeParams } from '../../patch'
import { parseProject, serializeProject } from '../../persistence'
import { type Project, createClip, createDemoProject, createNote, createReturnTrack, createTrack } from '../../project'
import { SLOW, allFinite, peak, renderScene } from '../test-helpers'
import { FACTORY_CONTENT, createFactoryCatalog, factoryIdOf, factoryNotes, withStableIds } from '.'

const catalog = createFactoryCatalog()
const sounds = catalog.items.filter((item) => 'revisionId' in item.content)
const payloadOf = (item: LibraryItem) => catalog.revisions.find((revision) => 'revisionId' in item.content && revision.id === item.content.revisionId)!.payload
const instruments = sounds.filter((item) => payloadOf(item).kind === 'instrument')
const effects = sounds.filter((item) => payloadOf(item).kind === 'audio-effect')
const folderPath = (item: LibraryItem) => {
  const names: string[] = []
  for (let id = item.folderId; id !== null; ) {
    const folder = catalog.folders.find((candidate) => candidate.id === id)!
    names.unshift(folder.name)
    id = folder.parentId
  }
  return names.join(' / ')
}

describe('the Factory catalog', () => {
  it('is the same JSON every time it is built, every id a stable factory: path', () => {
    expect(JSON.stringify(createFactoryCatalog())).toBe(JSON.stringify(catalog))
    const ids = [...catalog.folders.map((folder) => folder.id), ...catalog.items.map((item) => item.id), ...catalog.revisions.map((revision) => revision.id), ...sounds.map((item) => (item.content as { state: { id: string } }).state.id)]
    expect(ids.every(isFactoryId)).toBe(true)
    expect(catalog.items.map((item) => item.id)).toContain('factory:drums/kick')
    expect(catalog.items.map((item) => item.id)).toContain('factory:effects/returns/hall-glass-rain')
    expect(catalog.folders.find((folder) => folder.id === 'factory:effects/returns')?.parentId).toBe('factory:effects')
  })

  it("passes the library's strict checks, as an imported bundle would", () => {
    expect(() => validateLibraryCatalog(JSON.parse(JSON.stringify(catalog)))).not.toThrow()
  })

  it('holds the table: 49 items, 12 clips, 5 starters, no presets or samples, and a description for each item', () => {
    expect(catalog.items).toHaveLength(FACTORY_CONTENT.length)
    expect(catalog.items.map((item) => item.id)).toEqual(FACTORY_CONTENT.map(factoryIdOf))
    expect(catalog.items.filter((item) => item.content.kind === 'midi-clip')).toHaveLength(12)
    expect(catalog.items.filter((item) => folderPath(item) === 'Starters').map((item) => item.name)).toEqual(['Basic synth', 'FM bell', 'Noise sweep', 'Sine sub', 'Synced delay'])
    expect(catalog.items.some((item) => item.content.kind === 'preset' || item.content.kind === 'sample')).toBe(false)
    expect(catalog.samples).toEqual([])
    expect(Object.keys(factoryNotes).sort()).toEqual(catalog.items.map((item) => item.id).sort())
    for (const note of Object.values(factoryNotes)) expect(note.length).toBeGreaterThan(10)
  })

  it('stays small enough to build on the first Library mount: the JSON is under 1 MiB', () => {
    // 524 900 bytes when the table was first written (49 items, 37 revisions).
    expect(JSON.stringify(catalog).length).toBeLessThan(1024 * 1024)
  })

  it('leaves out everything that reads another track (Kick duck, the pad notes)', () => {
    for (const item of sounds) {
      const payload = payloadOf(item)
      const graphs = [...(payload.kind === 'instrument' ? [payload.patch, payload.noteGraph] : [payload.graph]), ...payload.modules.map((module) => module.patch)]
      expect(graphs.flatMap((graph) => graph.nodes).filter((node) => ['send', 'trackAudio', 'trackNotes'].includes(node.type)), item.id).toEqual([])
    }
    const pluck = payloadOf(catalog.items.find((item) => item.id === 'factory:keys-and-synths/pluck')!)
    expect(pluck.kind === 'instrument' && pluck.noteGraph.nodes.map((node) => node.type)).toEqual(['clipNotes', 'noteOut'])
    const stab = payloadOf(catalog.items.find((item) => item.id === 'factory:keys-and-synths/organ-stab')!)
    expect(stab.kind === 'instrument' && stab.noteGraph.nodes.map((node) => node.type)).toContain('chord')
  })

  it('every effect fits the input its folder claims: tracks, returns or the master', () => {
    const input = (item: LibraryItem) => {
      const payload = payloadOf(item)
      return payload.kind === 'audio-effect' ? [payload.graph, ...payload.modules.map((module) => module.patch)].flatMap((graph) => graph.nodes).find((node) => EFFECT_INPUTS.includes(node.type))?.type : undefined
    }
    const claimed: Record<string, string> = { 'Effects / Tracks': 'trackIn', 'Effects / Returns': 'returnIn', 'Effects / Master': 'masterIn', Starters: 'trackIn' }
    expect(effects.length).toBe(10)
    for (const item of effects) expect(input(item), item.id).toBe(claimed[folderPath(item)])
  })
})

describe('withStableIds', () => {
  it('refuses two items with one path, and keys tell them apart', () => {
    let twins: LibraryCatalog = saveLibraryFolder(emptyLibrary(), 'Clips', null, 'f1')
    const clip = catalog.items.find((item) => item.content.kind === 'midi-clip')!
    twins = { ...twins, items: [{ ...clip, id: 'a', folderId: 'f1', name: 'Loop' }, { ...clip, id: 'b', folderId: 'f1', name: 'Loop' }] }
    expect(() => withStableIds(twins, 'x')).toThrow(/share a stable id: x:clips\/loop/)
    expect(withStableIds(twins, 'x', new Map([['b', 'loop-2']])).items.map((item) => item.id)).toEqual(['x:clips/loop', 'x:clips/loop-2'])
  })
})

/** Puts a Factory item into a copy of the Starter project, where its kind goes. */
const insertIntoStarter = (item: LibraryItem): Project => {
  let project = createDemoProject()
  const content = item.content
  if (content.kind === 'midi-clip') {
    const track = createTrack('Clip', project.sceneCount)
    project = { ...project, tracks: [...project.tracks, track] }
    return insertLibraryClip(project, catalog, item, track.id, 0).project
  }
  const payload = payloadOf(item)
  if (payload.kind === 'instrument') return insertLibraryAsset(project, catalog, item, { mode: 'new-track' }).project
  if (payload.kind === 'note-effect') return insertLibraryAsset(project, catalog, item, { mode: 'replace', scope: { owner: { kind: 'track', trackId: project.tracks[0]!.id }, domain: 'notes' } }).project
  const nodes = [payload.graph, ...payload.modules.map((module) => module.patch)].flatMap((graph) => graph.nodes).map((node) => node.type)
  if (nodes.includes('masterIn')) return insertLibraryAsset(project, catalog, item, { mode: 'replace', scope: { owner: { kind: 'master' }, domain: 'fx' } }).project
  if (nodes.includes('returnIn')) {
    const echo = createReturnTrack('Return')
    project = { ...project, tracks: [...project.tracks, echo] }
    return insertLibraryAsset(project, catalog, item, { mode: 'replace', scope: { owner: { kind: 'track', trackId: echo.id }, domain: 'fx' } }).project
  }
  return insertLibraryAsset(project, catalog, item, { mode: 'replace', scope: { owner: { kind: 'track', trackId: project.tracks[0]!.id }, domain: 'fx' } }).project
}

describe('Factory items in a project', () => {
  it.each(catalog.items.map((item) => [item.id, item] as const))('%s inserts into the Starter project, which saves and opens with no warnings', (_id, item) => {
    const project = insertIntoStarter(item)
    const parsed = parseProject(serializeProject(project))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.warnings).toEqual([])
  })

  /**
   * The instrument alone on a track, holding one note for two bars: the generative ones play while it is held, and a rain
   * that Randomize slowed to a drop a second needs a couple of bars to be heard at all (as Glass Rain's own test says).
   */
  const played = (item: LibraryItem, randomize: boolean) => {
    const inserted = insertLibraryAsset({ ...createDemoProject(), tracks: [] }, catalog, item, { mode: 'new-track' }).project
    const track = inserted.tracks[0]!
    if (track.kind !== 'instrument') throw new Error('Not an instrument')
    const pitch = /bass|sub/i.test(item.name) ? 40 : 60
    const patch = randomize ? randomizeParams(track.patch, inserted.modules, { seed: 7, amount: 1 }) : track.patch
    const project = { ...inserted, tracks: [{ ...track, patch, clips: [createClip('Held', 8, [createNote(pitch, 0, 8, 0.8)]), ...track.clips.slice(1)] }] }
    return renderScene(project, 0, 2, 1)
  }

  it.each(instruments.map((item) => [item.id, item] as const))('%s plays finite, audible and under full scale, and after a Randomize roll', { timeout: SLOW }, (_id, item) => {
    for (const randomize of [false, true]) {
      const { left, right } = played(item, randomize)
      const label = `${item.name}${randomize ? ' after Randomize' : ''}`
      expect(allFinite(left) && allFinite(right), label).toBe(true)
      expect(peak(left, right), `${label} is audible`).toBeGreaterThan(0.001)
      expect(peak(left, right), `${label} is not blown up`).toBeLessThan(0.97)
    }
  })
})
