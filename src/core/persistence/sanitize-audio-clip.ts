import { type AudioClip, WARP_MODES, clampAudioClip } from '../project'
import { createId } from '../shared'
import { type Warn, finiteNumber, isRecord, nonEmptyText } from './raw'

/**
 * An audio clip is only meaningful if its sample is in the project's library, so a clip pointing at
 * anything else is dropped (and reported) rather than left to play silence forever.
 */
export const sanitizeAudioClip = (
  raw: unknown,
  where: string,
  sampleIds: ReadonlySet<string>,
  usedIds: Set<string>,
  warn: Warn,
): AudioClip | null => {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) {
    warn(`${where}: skipped a malformed audio clip`)
    return null
  }
  if (typeof raw.sampleId !== 'string' || !sampleIds.has(raw.sampleId)) {
    warn(`${where}: skipped an audio clip whose sample is not in the project`)
    return null
  }

  const id = typeof raw.id === 'string' && !usedIds.has(raw.id) ? raw.id : createId('audio')
  usedIds.add(id)

  const warp = WARP_MODES.find((mode) => mode === raw.warp) ?? 'repitch'
  return clampAudioClip({
    id,
    name: nonEmptyText(raw.name, 'Audio clip', 40),
    sampleId: raw.sampleId,
    lengthBeats: finiteNumber(raw.lengthBeats, 4),
    loop: typeof raw.loop === 'boolean' ? raw.loop : true,
    warp,
    gain: finiteNumber(raw.gain, 1),
    // Clips saved before trim and fades existed play the whole sample with no fades, as they always did.
    start: finiteNumber(raw.start, 0),
    end: finiteNumber(raw.end, 1),
    fadeIn: finiteNumber(raw.fadeIn, 0),
    fadeOut: finiteNumber(raw.fadeOut, 0),
  })
}
