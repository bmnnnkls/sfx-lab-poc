import { tracksInOrder } from '@core'
import { useProjectStore } from '@state'
import { ChannelStrip } from './ChannelStrip'
import { MasterStrip } from './MasterStrip'
import styles from './Mixer.module.css'

/**
 * The "Mixer" tab: a channel strip for every track, then the return tracks, then the master, in the order the sound
 * flows (the same order as the session grid). The strips scroll sideways; the master stays at the right edge.
 */
export const MixerPanel = () => {
  const tracks = useProjectStore((state) => tracksInOrder(state.project))

  return (
    <div className={styles.mixer} data-scroll="x">
      {tracks.map((track) => (
        <ChannelStrip key={track.id} track={track} />
      ))}
      <MasterStrip />
    </div>
  )
}
