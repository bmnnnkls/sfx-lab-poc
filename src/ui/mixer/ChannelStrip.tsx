import { RETURN_IN_TYPE, TRACK_IN_TYPE, TRACK_OUT_TYPE, type Track, describeNode, mixesAfter, panOf } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { LevelBar } from './LevelBar'
import styles from './Mixer.module.css'

/** Everything in a graph except where the sound comes in and goes out counts as an effect. */
const ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, RETURN_IN_TYPE])

/** The fx badge, which opens the Effects tab on this track. */
export const EffectsBadge = ({ name, labels, onOpen }: { name: string; labels: string[]; onOpen: () => void }) =>
  labels.length === 0 ? null : (
    <button
      className={styles.fxBadge}
      title={`Effects: ${labels.join(', ')}`}
      aria-label={`${name} has ${labels.length} effect${labels.length === 1 ? '' : 's'}`}
      onClick={onOpen}
    >
      fx {labels.length}
    </button>
  )

/** One track in the mixer: pan, sends, mute and solo, the fader and the track's own level meter. */
export const ChannelStrip = ({ track }: { track: Track }) => {
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const setTab = useSelectionStore((state) => state.setTab)
  const modules = useProjectStore((state) => state.project.modules)
  const tracks = useProjectStore((state) => state.project.tracks)
  const setVolume = useProjectStore((state) => state.setTrackVolume)
  const setPan = useProjectStore((state) => state.setTrackPan)
  const setMuted = useProjectStore((state) => state.setTrackMuted)
  const setSoloed = useProjectStore((state) => state.setTrackSoloed)
  const setSend = useProjectStore((state) => state.setTrackSend)

  const returns = tracks.filter((candidate) => candidate.kind === 'return')
  const effects = track.fx.nodes.filter((node) => !ENDS.has(node.type))
  const labels = effects.map((node) => describeNode(node, modules)?.label ?? node.type)
  const muted = track.muted === true
  const soloed = track.soloed === true
  const pan = panOf(track)

  return (
    <section
      className={`${styles.strip} ${selected ? styles.selected : ''} ${track.kind === 'return' ? styles.returnStrip : ''} ${muted ? styles.mutedStrip : ''}`}
      aria-label={`${track.name} channel`}
    >
      <button className={styles.name} onClick={() => selectTrack(track.id)} title={`Select ${track.name}`}>
        {track.name}
        {track.kind !== 'instrument' && <span className={styles.kind}> {track.kind}</span>}
      </button>
      <div className={styles.badges}>
        <EffectsBadge
          name={track.name}
          labels={labels}
          onOpen={() => {
            selectTrack(track.id)
            setTab('fx')
          }}
        />
      </div>

      <label className={styles.pan} title="Pan (double-click to centre)">
        <span>{pan === 0 ? 'C' : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={pan}
          aria-label={`${track.name} pan`}
          onChange={(event) => setPan(track.id, Number(event.target.value))}
          onDoubleClick={() => setPan(track.id, 0)}
        />
      </label>

      {track.kind !== 'return' && returns.length > 0 && (
        <div className={styles.sends} role="group" aria-label={`${track.name} sends`}>
          {returns.map((target) => {
            // A track that takes audio from a return cannot send to it as well: that would be a loop.
            const loop = mixesAfter({ tracks, modules }, track.id, target.id)
            const title = loop
              ? `${track.name} takes audio from ${target.name}, so it cannot send to it`
              : `Send to ${target.name} (post-fader: after the effects and the volume)`
            return (
              <label key={target.id} className={styles.send} title={title}>
                <span>{target.name}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.sends[target.id] ?? 0}
                  aria-label={`${track.name} send to ${target.name}`}
                  disabled={loop}
                  onChange={(event) => setSend(track.id, target.id, Number(event.target.value))}
                />
              </label>
            )
          })}
        </div>
      )}

      <div className={styles.buttons}>
        <button className={muted ? styles.mute : ''} aria-pressed={muted} aria-label={`${track.name} mute`} title="Mute: silence the track, including its sends" onClick={() => setMuted(track.id, !muted)}>
          M
        </button>
        <button className={soloed ? styles.solo : ''} aria-pressed={soloed} aria-label={`${track.name} solo`} title="Solo: hear only soloed tracks (and the returns they feed)" onClick={() => setSoloed(track.id, !soloed)}>
          S
        </button>
      </div>

      <div className={styles.faderRow}>
        <input
          className={styles.fader}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.volume}
          aria-label={`${track.name} fader`}
          aria-orientation="vertical"
          onChange={(event) => setVolume(track.id, Number(event.target.value))}
        />
        <LevelBar label={`${track.name} level`} read={(status) => status.peaks[track.id] ?? 0} />
      </div>
      <output className={styles.value}>{Math.round(track.volume * 100)}</output>
    </section>
  )
}
