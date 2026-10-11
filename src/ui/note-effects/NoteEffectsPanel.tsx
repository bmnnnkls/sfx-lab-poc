import { type InstrumentTrack, MAX_NOTE_EFFECTS, noteEffectDefinitions } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { EffectCard } from './EffectCard'
import { HeardNotes } from './HeardNotes'
import styles from './NoteEffects.module.css'

/**
 * The "Notes" tab: the selected instrument track's MIDI effect chain. Notes flow left to right from the
 * clip, through each effect, into the instrument; below, a piano roll shows what the instrument will hear.
 */
export const NoteEffectsPanel = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)

  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) return <p className={styles.empty}>Add an instrument track to give it MIDI effects.</p>
  if (track.kind === 'audio') {
    return (
      <p className={styles.empty}>
        “{track.name}” is an audio track, so it has no notes to process. Select an instrument track to edit its MIDI
        effects.
      </p>
    )
  }
  return <ChainEditor key={track.id} track={track} />
}

const ChainEditor = ({ track }: { track: InstrumentTrack }) => {
  const addEffect = useProjectStore((state) => state.addNoteEffect)
  const effects = track.noteEffects

  return (
    <div className={styles.panel} data-testid="note-effects-panel">
      <div className={styles.flow}>
        <div className={`${styles.end} ${styles.endIn}`}>
          <strong>{track.name}</strong>
          <span>clip notes</span>
        </div>
        {effects.map((effect, index) => (
          <EffectCard
            key={effect.id}
            trackId={track.id}
            effect={effect}
            first={index === 0}
            last={index === effects.length - 1}
          />
        ))}
        <span className={styles.arrow} aria-hidden>
          →
        </span>
        <div className={styles.end}>
          <span>Voices → instrument</span>
        </div>
        <label className={styles.add}>
          <select
            value=""
            aria-label="Add MIDI effect"
            disabled={effects.length >= MAX_NOTE_EFFECTS}
            onChange={(event) => event.target.value && addEffect(track.id, event.target.value)}
          >
            <option value="">+ Add effect</option>
            {noteEffectDefinitions.map((definition) => (
              <option key={definition.type} value={definition.type}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {effects.length === 0 && (
        <p className={styles.hint}>
          No MIDI effects yet. Add an arpeggiator, scale lock or chord and the notes of this track’s clips change
          before they reach the instrument.
        </p>
      )}
      <HeardNotes track={track} />
    </div>
  )
}
