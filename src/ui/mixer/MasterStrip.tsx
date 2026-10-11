import { MASTER_IN_TYPE, TRACK_OUT_TYPE, describeNode } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { EffectsBadge } from './ChannelStrip'
import { LevelBar } from './LevelBar'
import styles from './Mixer.module.css'

/** The end of the mixer: the master fader and the level of the final output. */
export const MasterStrip = () => {
  const modules = useProjectStore((state) => state.project.modules)
  const fx = useProjectStore((state) => state.project.master.fx)
  const volume = useProjectStore((state) => state.project.master.volume ?? 1)
  const setVolume = useProjectStore((state) => state.setMasterVolume)
  const selectMaster = useSelectionStore((state) => state.selectMaster)
  const labels = fx.nodes
    .filter((node) => node.type !== MASTER_IN_TYPE && node.type !== TRACK_OUT_TYPE)
    .map((node) => describeNode(node, modules)?.label ?? node.type)

  return (
    <section className={`${styles.strip} ${styles.masterStrip}`} aria-label="Master channel">
      <span className={styles.name}>Master</span>
      <div className={styles.badges}>
        <EffectsBadge name="Master" labels={labels} onOpen={selectMaster} />
      </div>
      <div className={styles.faderRow}>
        <input
          className={styles.fader}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Master fader"
          aria-orientation="vertical"
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <LevelBar label="Master level" read={(status) => status.peak} />
      </div>
      <output className={styles.value}>{Math.round(volume * 100)}</output>
    </section>
  )
}
