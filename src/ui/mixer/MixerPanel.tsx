import { useProjectStore } from '@state'
import { useMemo } from 'react'
import { sessionOrder } from '../session-view/track-order'
import { ChannelStrip } from './ChannelStrip'
import { MasterStrip } from './MasterStrip'
import styles from './Mixer.module.css'

/**
 * The "Mixer" tab: a channel strip for every track, then the return tracks, then the master, in the order the sound
 * flows (the same order as the session grid). The strips scroll sideways; the master stays at the right edge.
 */
export const MixerPanel = () => {
  const projectTracks = useProjectStore((state) => state.project.tracks)
  const tracks = useMemo(() => sessionOrder(projectTracks), [projectTracks])

  return (
    <div className={styles.mixer} data-scroll="x">
      {tracks.map((track) => (
        <ChannelStrip key={track.id} track={track} />
      ))}
      <MasterStrip />
    </div>
  )
}
