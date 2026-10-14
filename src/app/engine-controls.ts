import type { AudioHost } from '@audio'
import type { EngineControls } from '@state'

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
    play: () => run({ type: 'transport/play' }),
    stop: () => run({ type: 'transport/stop' }),
    launchClip: (trackId, clipId) => run({ type: 'clip/launch', trackId, clipId }),
    launchScene: (scene) => run({ type: 'scene/launch', scene }),
    stopTrack: (trackId) => run({ type: 'track/stop', trackId }),
    auditionNote: (trackId, pitch, velocity) => run({ type: 'track/audition', trackId, pitch, velocity }),
    noteOn: (trackId, pitch, velocity) => run({ type: 'track/noteOn', trackId, pitch, velocity }),
    noteOff: (trackId, pitch) => run({ type: 'track/noteOff', trackId, pitch }),
  }
}
