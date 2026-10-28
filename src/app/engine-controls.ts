import type { AudioHost } from '@audio'
import { type EngineControls, useControlStore, finishTouches } from '@state'

/**
 * Binds UI intents to engine commands. Every control starts audio first, so the
 * first click anywhere satisfies the browser's autoplay (user-gesture) rule.
 */
export const createEngineControls = (host: AudioHost): EngineControls => {
  const run = (command: Parameters<AudioHost['send']>[0]) => {
    void host.start()
    host.send(command)
  }

  return {
    noteOn: (trackId, note, pitch, velocity) => run({ type: 'track/noteOn', trackId, note, pitch, velocity }),
    noteOff: (trackId, note) => run({ type: 'track/noteOff', trackId, note }),
    sustain: (sourceId, channel, down) => run({ type: 'notes/sustain', sourceId, channel, down }),
    releaseSource: (sourceId, channel) => run({ type: 'notes/releaseSource', sourceId, ...(channel === undefined ? {} : { channel }) }),
    panic: () => run({ type: 'notes/panic' }),
    play: () => run({ type: 'transport/play' }),
    stop: () => { finishTouches(); useControlStore.getState().clear(); run({ type: 'transport/stop' }) },
    launchClip: (trackId, clipId) => run({ type: 'clip/launch', trackId, clipId }),
    launchAutomation: (owner, slotId) => run({ type: 'automation/launch', owner, slotId }),
    launchScene: (scene, trackIds) => run({ type: 'scene/launch', scene, ...(trackIds && { trackIds }) }),
    stopTrack: (trackId) => run({ type: 'track/stop', trackId }),
    auditionNote: (trackId, pitch, velocity) => run({ type: 'track/audition', trackId, pitch, velocity }),
    playArrangement: (fromBeat = 0) => run({ type: 'arrangement/play', fromBeat }),
  }
}
