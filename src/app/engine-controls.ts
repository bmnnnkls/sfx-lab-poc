import type { AudioHost } from '@audio'
import type { CountInStart } from '@core'
import { type EngineControls, countInBars, useControlStore, finishTouches, startArrangementTakes, stopTakes } from '@state'

/**
 * Binds UI intents to engine commands. Every control starts audio first, so the
 * first click anywhere satisfies the browser's autoplay (user-gesture) rule.
 */
export const createEngineControls = (host: AudioHost): EngineControls => {
  const run = (command: Parameters<AudioHost['send']>[0]) => {
    void host.start()
    host.send(command)
  }
  /** A start that records from a stopped transport counts in first, when a count-in is set. */
  const start = (command: CountInStart, take?: { trackId: string; clipId: string }) => {
    const bars = countInBars(take)
    run(bars ? { type: 'transport/countIn', bars, then: command } : command)
  }

  return {
    noteOn: (trackId, note, pitch, velocity) => run({ type: 'track/noteOn', trackId, note, pitch, velocity }),
    noteOff: (trackId, note) => run({ type: 'track/noteOff', trackId, note }),
    sustain: (sourceId, channel, down) => run({ type: 'notes/sustain', sourceId, channel, down }),
    releaseSource: (sourceId, channel) => run({ type: 'notes/releaseSource', sourceId, ...(channel === undefined ? {} : { channel }) }),
    panic: () => run({ type: 'notes/panic' }),
    play: () => start({ type: 'transport/play' }),
    stop: () => { finishTouches(); stopTakes(); useControlStore.getState().clear(); run({ type: 'transport/stop' }) },
    launchClip: (trackId, clipId) => start({ type: 'clip/launch', trackId, clipId }, { trackId, clipId }),
    launchAutomation: (owner, slotId) => run({ type: 'automation/launch', owner, slotId }),
    launchScene: (scene, trackIds) => start({ type: 'scene/launch', scene, ...(trackIds && { trackIds }) }),
    stopTrack: (trackId) => run({ type: 'track/stop', trackId }),
    auditionNote: (trackId, pitch, velocity) => run({ type: 'track/audition', trackId, pitch, velocity }),
    // ▶ on the arrangement, or a seek while it plays: with ● Rec on, the armed tracks record from there (after a
    // count-in from a stopped transport).
    playArrangement: (fromBeat = 0) => { startArrangementTakes(fromBeat); start({ type: 'arrangement/play', fromBeat }) },
  }
}
