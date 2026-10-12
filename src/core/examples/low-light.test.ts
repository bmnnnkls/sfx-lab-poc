import { describe, expect, it } from 'vitest'
import { createDefaultFxGraph, randomizeParams } from '../patch'
import type { Project } from '../project'
import { findExampleProject } from '.'
import { LOW_LIGHT_TEMPO } from './tech-house'
import { SLOW, allFinite, busiestScene, everyGraph, instrumentTracks, only, peak, press, renderScene, rmsDb, trackOf } from './test-helpers'

const project = findExampleProject('low-light')!.create()

describe('Low Light', () => {
  it('is eight scenes of minimal tech house at 125 BPM with the parts it says it has', () => {
    expect(project.tempo).toBe(LOW_LIGHT_TEMPO)
    expect(project.tempo).toBe(125)
    expect(project.sceneCount).toBe(8)
    expect(instrumentTracks(project).map((track) => track.name)).toEqual(['Kick', 'Clap', 'Hat', 'Open hat', 'Shaker', 'Knocks', 'Bass', 'Stab', 'Arp', 'Drone', 'Riser', 'Crash', 'Dust'])
    expect(project.tracks.filter((track) => track.kind === 'return').map((track) => track.name)).toEqual(['Room', 'Echo', 'Hall'])
  })

  it('arranges them: the break has no kick and no bass, the drop has everything that plays, every bass note is in A minor', () => {
    expect([trackOf(project, 'kick').clips[4], trackOf(project, 'bass').clips[4]]).toEqual([null, null])
    expect(instrumentTracks(project).filter((track) => track.clips[6]).length).toBeGreaterThanOrEqual(10)
    const minor = new Set([9, 11, 0, 2, 4, 5, 7])
    for (const clip of trackOf(project, 'bass').clips) for (const note of clip?.notes ?? []) expect(minor.has(note.pitch % 12), `bass note ${note.pitch}`).toBe(true)
  })

  it('shares its modules between tracks: five noise hits, five kick ducks, two soft clips, one organ', () => {
    const uses = (moduleId: string) => everyGraph(project).reduce((count, graph) => count + graph.nodes.filter((node) => node.moduleId === moduleId).length, 0)
    expect(uses('low-light-noise-hit')).toBe(5)
    expect(uses('low-light-kick-duck')).toBeGreaterThanOrEqual(5)
    expect(uses('low-light-soft-clip')).toBe(2)
    expect(uses('low-light-organ')).toBe(1)
  })

  it('plays: finite, audible and with headroom, in its first scene and its busiest', { timeout: SLOW }, () => {
    for (const scene of new Set([0, busiestScene(project)])) {
      const { left, right } = renderScene(project, scene, 1)
      expect(allFinite(left) && allFinite(right), `scene ${scene + 1}`).toBe(true)
      expect(peak(left, right), `scene ${scene + 1} is audible`).toBeGreaterThan(0.05)
      expect(peak(left, right), `scene ${scene + 1} leaves headroom`).toBeLessThan(0.9)
    }
  })

  it('renders the same samples every time (every random source is seeded)', { timeout: SLOW }, () => {
    const scene = busiestScene(project)
    const a = renderScene(project, scene, 1)
    const b = renderScene(findExampleProject('low-light')!.create(), scene, 1)
    expect(a.left.every((value, index) => value === b.left[index])).toBe(true)
    expect(a.right.every((value, index) => value === b.right[index])).toBe(true)
  })

  it('has a kick that is the same on every hit (a ringing filter starts the same way each time; an oscillator would not)', { timeout: SLOW }, () => {
    const { left } = renderScene(only(project, ['kick']), 0, 2)
    const hit = (index: number) => left.subarray(Math.round(index * 0.48 * 48000), Math.round(index * 0.48 * 48000 + 0.06 * 48000))
    const reference = hit(0)
    for (let index = 1; index < 6; index++) {
      const other = hit(index)
      let dot = 0
      let a = 0
      let b = 0
      for (let i = 0; i < reference.length; i++) {
        dot += (reference[i] as number) * (other[i] as number)
        a += (reference[i] as number) ** 2
        b += (other[i] as number) ** 2
      }
      expect(dot / Math.sqrt(a * b), `hit ${index + 1} against hit 1`).toBeGreaterThan(0.98)
    }
  })

  it('ducks the bass under the real sound of the kick: take the duck away and the bass is louder', { timeout: SLOW }, () => {
    const keep = only({ ...project, tracks: project.tracks.map((track) => (track.id === 'kick' ? { ...track, muted: true } : track)) }, ['kick', 'bass'])
    const plain = { ...keep, tracks: keep.tracks.map((track) => (track.id === 'bass' ? { ...track, fx: createDefaultFxGraph() } : track)) }
    const ducked = renderScene(keep, 1, 2)
    const open = renderScene(plain, 1, 2)
    expect(rmsDb(open.left, open.right)).toBeGreaterThan(-60) // the kick is muted, so this is the bass alone
    expect(rmsDb(ducked.left, ducked.right)).toBeLessThan(rmsDb(open.left, open.right) - 0.5)
  })

  it('has a Cut button that mutes the whole mix while it is held', { timeout: SLOW }, () => {
    const held = { ...project, master: { ...project.master, fx: press(project.master.fx, 'master_cut') } }
    const { left, right } = renderScene(held, 6, 1)
    expect(rmsDb(left, right)).toBeLessThan(-90)
  })

  it('has a Throw button that makes the echo build instead of dying away', { timeout: SLOW }, () => {
    const tail = (p: Project) => {
      const { left, right } = renderScene(p, 6, 1, 2)
      return rmsDb(left, right, Math.round(2.2 * 48000), Math.round(3.6 * 48000))
    }
    const thrown = { ...project, tracks: project.tracks.map((track) => (track.id === 'echo' ? { ...track, fx: press(track.fx, 'fx_throw') } : track)) }
    expect(tail(thrown)).toBeGreaterThan(tail(project) + 3)
  })

  it('cannot be broken by Randomize: every instrument still sounds, finite and under full scale, with a new seed', { timeout: SLOW * 2 }, () => {
    for (const track of instrumentTracks(project)) {
      const scene = track.clips.findIndex((clip, index) => clip && index >= 2)
      const firstStart = Math.min(...(track.clips[scene]?.notes.map((note) => note.start) ?? [0]))
      const kept = only(project, [track.id])
      const rolled = { ...kept, tracks: kept.tracks.map((candidate) => (candidate.id === track.id && candidate.kind === 'instrument' ? { ...candidate, patch: randomizeParams(candidate.patch, project.modules, { seed: 7, amount: 1 }) } : candidate)) }
      // Long enough for a part that enters late to be heard (the riser starts on beat 8).
      const { left, right } = renderScene(rolled, scene, Math.max(1, Math.ceil((firstStart + 4) / 4)), 1)
      expect(allFinite(left) && allFinite(right), track.id).toBe(true)
      expect(peak(left, right), `${track.id} is audible after Randomize`).toBeGreaterThan(0.001)
      expect(peak(left, right), `${track.id} is not blown up after Randomize`).toBeLessThan(0.97)
    }
  })
})
