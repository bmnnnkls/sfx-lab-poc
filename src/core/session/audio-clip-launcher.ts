import type { AudioClip } from '../project'
import { LaunchQueue } from './launch-queue'
import type { AudioEvent, LauncherStatus } from './types'

/**
 * Launches audio clips on a track: the same queued, bar-quantized launching as MIDI clips, but the
 * result is just "start this clip at beat B" or "stop at beat B". What is actually sounding (and for how
 * long, since a one-shot ends by itself) is the audio player's business, not the launcher's.
 */
export class AudioClipLauncher {
  private readonly queue = new LaunchQueue<AudioClip>()

  launch(clip: AudioClip): void {
    this.queue.launch(clip)
  }

  /** Queues a stop at the next boundary. */
  stop(): void {
    this.queue.stop()
  }

  reset(): void {
    this.queue.reset()
  }

  syncClips(clips: readonly (AudioClip | null)[]): void {
    this.queue.sync(clips)
  }

  /** What is queued (the launch state shown on the slot); "playing" is reported by the player instead. */
  queuedStatus(): LauncherStatus['queued'] {
    return this.queue.status().queued
  }

  /** The start/stop that falls in the beat range [from, to), if any. Ranges must be contiguous. */
  collectEvents(from: number, to: number): AudioEvent[] {
    const boundary = this.queue.pendingBoundary(from, to)
    if (boundary === null) return []
    const clip = this.queue.queued?.clip ?? null
    this.queue.commit(boundary)
    return clip ? [{ beat: boundary, kind: 'start', clip }] : [{ beat: boundary, kind: 'stop' }]
  }
}
