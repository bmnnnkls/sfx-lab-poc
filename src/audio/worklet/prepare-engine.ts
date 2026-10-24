import { Engine, type EngineCommand } from '@core'

/** Prime code paths in a separate engine while the host context is suspended.
 * No reference to the audible engine is accepted; sample assets are read, never transferred or modified.
 * The temporary engine and command references become collectible when this function returns.
 */
export const prepareEngine = (commands: readonly EngineCommand[], rate: number): void => {
  const engine = new Engine(rate)
  const instruments = new Set<string>()
  for (const command of commands) {
    engine.apply(command)
    if (command.type === 'track/add') {
      instruments.delete(command.trackId)
      if (command.kind === 'instrument') instruments.add(command.trackId)
    } else if (command.type === 'track/remove') instruments.delete(command.trackId)
  }
  engine.status() // Prime readout/status paths as well as sound; never publish the temporary engine's status.
  // Exercise every configured instrument, even when the user's first gesture is a knob or a stopped live note.
  engine.apply({ type: 'scene/launch', scene: 0 })
  const address = { sourceId: 'startup-preparation', channel: 0, noteId: 'prime' }
  for (const trackId of instruments) engine.apply({ type: 'track/noteOn', trackId, note: address, pitch: 60, velocity: .5 })
  const left = new Float32Array(128), right = new Float32Array(128)
  const render = (frames: number) => {
    for (let offset = 0; offset < frames; offset += left.length) {
      const n = Math.min(left.length, frames - offset)
      engine.render(left.subarray(0, n), right.subarray(0, n))
    }
  }
  render(rate)
  engine.status()
  engine.apply({ type: 'transport/stop' })
  for (const trackId of instruments) engine.apply({ type: 'track/noteOn', trackId, note: address, pitch: 60, velocity: .5 })
  render(128)
  engine.apply({ type: 'notes/panic' })
  render(Math.ceil(rate / 4))
  engine.status()
}
