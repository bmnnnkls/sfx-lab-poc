import { type AudioCopy, copyAudioRange } from '@core'
import { createClipboard } from './clipboard'
import type { WaveAudio } from './wave-audio-store'
import type { WaveSelection } from './wave-editor-store'

/**
 * Copied audio from the Wave editor, with its handles: what *Paste* inserts. A copy from one channel of a stereo sample
 * holds that channel alone. In memory, not the operating system's clipboard.
 */
export const audioClipboard = createClipboard<AudioCopy | null>(null)

/** *Copy*: the selection of the open sample's working copy, on its channels. Not an edit, so nothing to undo. */
export const copyWaveSelection = (wave: WaveAudio, selection: WaveSelection) => {
  const stereo = wave.audio.channels.length > 1
  const channels = !stereo || selection.channels === 'both' ? wave.audio.channels.map((_, index) => index) : [selection.channels === 'left' ? 0 : 1]
  audioClipboard.set(copyAudioRange(wave.audio, selection, channels))
}
