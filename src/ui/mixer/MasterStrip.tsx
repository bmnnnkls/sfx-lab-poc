import { MidiTargetMenu } from '../midi/MidiTargetMenu'
import { type ControlTarget, MASTER_IN_TYPE, TRACK_OUT_TYPE, describeNode } from '@core'
import { openMasterEffects, useProjectStore } from '@state'
import { EffectsBadge } from './ChannelStrip'
import { useControlGesture } from '../controls/use-control-gesture'
import { EffectiveValue } from '../controls/EffectiveValue'
import { LevelBar } from './LevelBar'
import styles from './Mixer.module.css'

/** The end of the mixer: the master fader and the level of the final output. */
export const MasterStrip = () => {
  const modules = useProjectStore((state) => state.project.modules)
  const fx = useProjectStore((state) => state.project.master.fx)
  const volume = useProjectStore((state) => state.project.master.volume ?? 1)
  const gesture = useControlGesture()
  const target: ControlTarget = { kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }
  const setVolume = (value: number) => gesture.change([{ target, value }])
  const labels = fx.nodes
    .filter((node) => node.type !== MASTER_IN_TYPE && node.type !== TRACK_OUT_TYPE)
    .map((node) => describeNode(node, modules)?.label ?? node.type)

  return (
    <section {...gesture.events} className={`${styles.strip} ${styles.masterStrip}`} aria-label="Master channel">
      <span className={styles.name}>Master</span>
      <div className={styles.badges}>
        <EffectsBadge name="Master" labels={labels} onOpen={openMasterEffects} />
      </div>
      <div className={styles.faderRow}>
        <MidiTargetMenu targets={[target]}><input
          className={styles.fader}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Master fader"
          aria-orientation="vertical"
          onChange={(event) => setVolume(Number(event.target.value))}
        /></MidiTargetMenu>
        <LevelBar label="Master level" read={(status) => status.peak} />
      </div>
      <EffectiveValue target={target} />
      <output className={styles.value}>{Math.round(volume * 100)}</output>
    </section>
  )
}
