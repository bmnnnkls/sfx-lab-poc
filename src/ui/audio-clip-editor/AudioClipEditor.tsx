import {
  type AudioClip,
  type AudioTrack,
  MAX_GAIN,
  WARP_MODES,
  type WarpMode,
  guessLengthBeats,
  playbackSpeed,
} from '@core'
import { useProjectStore } from '@state'
import toolbar from '../clip-editor/ClipEditor.module.css'
import { LengthField } from '../clip-editor/LengthField'
import styles from './AudioClipEditor.module.css'
import { AudioWaveform } from './AudioWaveform'

const WARP_LABELS: Record<WarpMode, string> = {
  repitch: 'Re-pitch to tempo',
  off: 'Off (original speed)',
}

const describeSpeed = (speed: number, tempo: number): string => {
  const semitones = 12 * Math.log2(speed)
  const sign = semitones >= 0 ? '+' : '−'
  return `Plays at ×${speed.toFixed(2)} speed (${sign}${Math.abs(semitones).toFixed(1)} semitones) at ${Math.round(tempo)} BPM`
}

/**
 * Editor for one audio clip: which sample, how it follows the tempo, whether it loops, how long it is,
 * and how loud. Every change goes through `updateAudioClip`, so it is undoable and reaches the engine live.
 */
export const AudioClipEditor = ({ track, clip }: { track: AudioTrack; clip: AudioClip }) => {
  const samples = useProjectStore((state) => state.project.samples)
  const tempo = useProjectStore((state) => state.project.tempo)
  const update = useProjectStore((state) => state.updateAudioClip)

  const sample = samples.find((candidate) => candidate.id === clip.sampleId)
  const change = (changes: Parameters<typeof update>[2]) => update(track.id, clip.id, changes)

  return (
    <div className={toolbar.editor} data-clip-editor>
      <div className={toolbar.toolbar}>
        <strong>
          {track.name} / {clip.name}
        </strong>

        <label className={toolbar.field}>
          Sample
          <select value={clip.sampleId} aria-label="Sample" onChange={(event) => change({ sampleId: event.target.value })}>
            {samples.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>

        <label className={toolbar.field} title="Re-pitch speeds the clip up or down to fit its length at the project tempo, so it stays in time. Off plays it at its original speed.">
          Warp
          <select value={clip.warp} aria-label="Warp mode" onChange={(event) => change({ warp: event.target.value as WarpMode })}>
            {WARP_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {WARP_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        <label className={toolbar.field}>
          <input type="checkbox" checked={clip.loop} onChange={(event) => change({ loop: event.target.checked })} />
          Loop
        </label>

        {clip.warp === 'repitch' && (
          <>
            <LengthField lengthBeats={clip.lengthBeats} onCommit={(lengthBeats) => change({ lengthBeats })} />
            {sample && (
              <button
                onClick={() => change({ lengthBeats: guessLengthBeats(sample, tempo) })}
                title="Set the length to the whole number of beats this sample spans at the current tempo"
              >
                Fit to tempo
              </button>
            )}
          </>
        )}

        <label className={toolbar.field}>
          Gain
          <input
            type="range"
            min={0}
            max={MAX_GAIN * 100}
            value={Math.round(clip.gain * 100)}
            aria-label="Gain"
            onChange={(event) => change({ gain: Number(event.target.value) / 100 })}
          />
          <output className={styles.value}>{Math.round(clip.gain * 100)}%</output>
        </label>
      </div>

      <div className={styles.body}>
        <p className={styles.info} data-testid="audio-speed">
          {sample
            ? clip.warp === 'repitch'
              ? describeSpeed(playbackSpeed(clip, sample.durationSeconds, tempo), tempo)
              : 'Plays at its original speed; tempo changes do not affect it.'
            : 'This clip’s sample is missing from the library.'}
        </p>
        <AudioWaveform
          trackId={track.id}
          clipId={clip.id}
          sampleId={clip.sampleId}
          lengthBeats={clip.lengthBeats}
          locked={clip.warp === 'repitch'}
        />
      </div>
    </div>
  )
}
