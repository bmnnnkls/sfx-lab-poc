import { describe, expect, it } from 'vitest'
import { type Patch, topologicalOrder } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { FLAGSHIP_EXAMPLE, exampleProjects, findExampleProject } from '.'
import { everyGraph, instrumentTracks } from './test-helpers'

describe('the registry', () => {
  it('lists every example once, with a way to start, and has the flagship', () => {
    expect(new Set(exampleProjects.map((example) => example.id)).size).toBe(exampleProjects.length)
    expect(exampleProjects.map((example) => example.id)).toEqual(['low-light', 'glass-rain'])
    expect(findExampleProject(FLAGSHIP_EXAMPLE)?.title).toBe('Low Light')
    expect(findExampleProject('nothing')).toBeUndefined()
    for (const example of exampleProjects) {
      expect(example.howTo.length, example.id).toBeGreaterThanOrEqual(3)
      expect(example.tagline).toMatch(/BPM/)
      expect(example.create().tempo, example.id).toBeGreaterThan(80)
    }
  })
})

describe.each(exampleProjects)('$title', (example) => {
  const project = example.create()

  it('is the same project every time it is built (ids included), so a saved copy and a fresh one agree', () => {
    expect(JSON.stringify(example.create())).toBe(JSON.stringify(project))
  })

  it('survives being saved and opened again exactly, with nothing repaired (a value out of range or a dangling reference would show here)', () => {
    const result = parseProject(serializeProject(project))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([])
    expect(JSON.parse(JSON.stringify(result.project))).toEqual(JSON.parse(JSON.stringify(project)))
  })

  it('names every one of its scenes (they are shown under the launch buttons)', () => {
    expect(project.sceneNames).toHaveLength(project.sceneCount)
    expect(project.sceneNames!.every((name) => name.length > 0 && name.length <= 24)).toBe(true)
    expect(new Set(project.sceneNames).size).toBe(project.sceneCount)
  })

  it('is well formed: unique track ids, a clip slot for every scene, every note inside its clip, every graph acyclic', () => {
    expect(new Set(project.tracks.map((track) => track.id)).size).toBe(project.tracks.length)
    expect(project.tracks.filter((track) => track.kind === 'return').length).toBeGreaterThan(0)
    for (const track of instrumentTracks(project)) {
      expect(track.clips, track.id).toHaveLength(project.sceneCount)
      for (const clip of track.clips) {
        if (!clip) continue
        expect(clip.lengthBeats, `${track.id} / ${clip.name}`).toBeGreaterThan(0)
        expect(new Set(clip.notes.map((note) => note.id)).size).toBe(clip.notes.length)
        for (const note of clip.notes) {
          expect(note.start, `${track.id} / ${clip.name}`).toBeGreaterThanOrEqual(0)
          expect(note.start, `${track.id} / ${clip.name}`).toBeLessThan(clip.lengthBeats)
          expect(note.velocity).toBeGreaterThan(0)
          expect(note.velocity).toBeLessThanOrEqual(1)
        }
      }
    }
    for (const graph of everyGraph(project)) expect(topologicalOrder(graph)).not.toBeNull()
  })

  it('is made to be played with: every instrument and the master have a panel, and every node is named for it', () => {
    const controls = (patch: Patch) => patch.nodes.filter((node) => ['control', 'xyPad', 'switch'].includes(node.type)).length
    for (const track of instrumentTracks(project)) {
      expect(controls(track.patch), `${track.id} has knobs on its panel`).toBeGreaterThan(0)
      expect(track.patch.nodes.some((node) => node.type === 'output'), `${track.id} has an output`).toBe(true)
    }
    expect(controls(project.master.fx), 'master').toBeGreaterThanOrEqual(3)
    for (const patch of everyGraph(project)) for (const node of patch.nodes) if (node.name !== undefined) expect(node.name.length).toBeLessThanOrEqual(60)
  })

  it('every send, every taken sound and every taken note points at a track that is there', () => {
    const ids = new Set(project.tracks.map((track) => track.id))
    for (const track of project.tracks) {
      if (track.kind !== 'return') for (const target of Object.keys(track.sends)) expect(ids.has(target), `${track.id} sends to ${target}`).toBe(true)
    }
    for (const graph of everyGraph(project)) for (const node of graph.nodes) if (node.trackId !== undefined) expect(ids.has(node.trackId), node.id).toBe(true)
  })
})
