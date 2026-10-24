import { type Project, type SampleInfo, addAudioTrackWithClip, addSamples, createDemoProject } from '@core'
import type { EngineControls } from '../engine-controls'
import type { PersonalLibrary } from '../library'
import { useProjectStore } from '../project-store'
import type { SampleLibrary } from '../sample-library'
import type { ActionContext } from './types'

/**
 * Only for tests: a context whose services record each call as `name(arg, …)` in `calls`. Any method can be called.
 */
export const fakeContext = (overrides: Partial<ActionContext> = {}): ActionContext & { calls: string[] } => {
  const calls: string[] = []
  const recorder = <T extends object>(name: string): T =>
    new Proxy({}, { get: (_target, method) => (...args: unknown[]) => { calls.push(`${name}.${String(method)}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`) } }) as T
  return {
    engine: recorder<EngineControls>('engine'),
    samples: recorder<SampleLibrary>('samples'),
    library: recorder<PersonalLibrary>('library'),
    origin: null,
    ...overrides,
    calls,
  }
}

export const kick: SampleInfo = { id: 'kick', name: 'Kick', extension: 'wav', durationSeconds: 0.5, sampleRate: 44100, channels: 1, bytes: 1000 }

/** The demo project (Bass, Lead and Pad, four scenes) plus an audio track with a Kick clip, loaded into the store. */
export const loadDemo = (): Project => {
  const project = addAudioTrackWithClip(addSamples(createDemoProject(), [kick]), kick)
  useProjectStore.getState().resetProject(project)
  return project
}
