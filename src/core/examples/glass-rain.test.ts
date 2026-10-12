import { describe, expect, it } from 'vitest'
import { flattenPatch, randomizeParams, resolveParams } from '../patch'
import { findExampleProject } from '.'
import { knob, patchOf, useModule } from './builder'
import { generativeModules } from './generative/modules'
import { GLASS_RAIN_TEMPO } from './generative'
import { SLOW, allFinite, busiestScene, instrumentTracks, only, peak, renderScene, trackOf } from './test-helpers'

const project = findExampleProject('glass-rain')!.create()

describe('Glass Rain', () => {
  it('is six scenes at 92 BPM whose parts are different lengths, so they drift against each other', () => {
    expect(project.tempo).toBe(GLASS_RAIN_TEMPO)
    expect(project.tempo).toBe(92)
    expect(project.sceneCount).toBe(6)
    const lengths = (id: string) => new Set(trackOf(project, id).clips.flatMap((clip) => (clip ? [clip.lengthBeats / 4] : [])))
    expect(lengths('bells')).toEqual(new Set([5, 7]))
    expect(lengths('drops')).toEqual(new Set([7]))
    expect(lengths('heart')).toEqual(new Set([1.5]))
    expect(lengths('ticks')).toEqual(new Set([3]))
    expect(lengths('pad')).toEqual(new Set([16]))
  })

  it('has chords and a sub whose every note is in the scale the generative parts play (D E G A C), so nothing can clash', () => {
    const scale = new Set([2, 4, 7, 9, 0])
    for (const id of ['pad', 'sub']) for (const clip of trackOf(project, id).clips) for (const note of clip?.notes ?? []) expect(scale.has(note.pitch % 12), `${id} note ${note.pitch}`).toBe(true)
  })

  it('turns a position on the scale into a note of D suspended pentatonic, and nothing else', () => {
    const modules = generativeModules()
    const hzOf = (position: number, extra: Record<string, number> = {}) => {
      const patch = patchOf(
        [knob('position', 'Position', { value: position, min: 0, max: 40 }), useModule('scale', 'glass-rain-scale-note', extra), { id: 'osc', type: 'oscillator' }],
        ['position.out>scale.whole:in', 'scale.hz:out>osc.param:frequency'],
        { modules },
      )
      return resolveParams(flattenPatch(patch, modules), 'osc').values.frequency as number
    }
    const midi = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440))
    // From D5 (74) up: D E G A C, then D again an octave higher.
    expect([0, 1, 2, 3, 4, 5].map((position) => midi(hzOf(position)))).toEqual([74, 76, 79, 81, 84, 86])
    // Whatever the position, the note is in the scale: a fraction is rounded to a position first.
    for (const position of [0.4, 1.7, 2.2, 3.9, 7, 11.3]) expect([2, 4, 7, 9, 0].includes(midi(hzOf(position)) % 12), `position ${position}`).toBe(true)
  })

  it('plays: finite, audible and with headroom, in its first scene and its busiest', { timeout: SLOW }, () => {
    for (const scene of new Set([0, busiestScene(project)])) {
      const { left, right } = renderScene(project, scene, 1)
      expect(allFinite(left) && allFinite(right), `scene ${scene + 1}`).toBe(true)
      expect(peak(left, right), `scene ${scene + 1} is audible`).toBeGreaterThan(0.02)
      expect(peak(left, right), `scene ${scene + 1} leaves headroom`).toBeLessThan(0.9)
    }
  })

  it('renders the same samples every time (every random source is seeded)', { timeout: SLOW }, () => {
    const scene = busiestScene(project)
    const a = renderScene(project, scene, 1)
    const b = renderScene(findExampleProject('glass-rain')!.create(), scene, 1)
    expect(a.left.every((value, index) => value === b.left[index])).toBe(true)
    expect(a.right.every((value, index) => value === b.right[index])).toBe(true)
  })

  it('wakes the arp only when the pad is played hard: it is silent in a soft scene and plays in a loud one', { timeout: SLOW }, () => {
    const arpAlone = (scene: number) => {
      const kept = only(project, ['pad', 'arp'])
      const { left, right } = renderScene({ ...kept, tracks: kept.tracks.map((track) => (track.id === 'pad' ? { ...track, muted: true } : track)) }, scene, 1)
      return peak(left, right)
    }
    expect(arpAlone(0)).toBeLessThan(0.002)
    expect(arpAlone(3)).toBeGreaterThan(0.01)
  })

  it('cannot be broken by Randomize: every instrument still sounds, finite and under full scale, with a new seed', { timeout: SLOW * 2 }, () => {
    for (const track of instrumentTracks(project)) {
      const scene = track.clips.findIndex((clip, index) => clip && index >= 2) >= 0 ? track.clips.findIndex((clip, index) => clip && index >= 2) : 3
      // The tracks it listens to keep playing (the arp takes the pad's notes).
      const keep = [track.id, ...track.noteGraph.nodes.flatMap((node) => (node.trackId === undefined ? [] : [node.trackId]))]
      const kept = only(project, keep)
      const rolled = { ...kept, tracks: kept.tracks.map((candidate) => (candidate.id === track.id && candidate.kind === 'instrument' ? { ...candidate, patch: randomizeParams(candidate.patch, project.modules, { seed: 7, amount: 1 }) } : candidate)) }
      // A rain that Randomize slowed to a drop a second needs a couple of bars to be heard at all.
      const { left, right } = renderScene(rolled, scene, 2, 1)
      expect(allFinite(left) && allFinite(right), track.id).toBe(true)
      expect(peak(left, right), `${track.id} is audible after Randomize`).toBeGreaterThan(0.001)
      expect(peak(left, right), `${track.id} is not blown up after Randomize`).toBeLessThan(0.97)
    }
  })
})
