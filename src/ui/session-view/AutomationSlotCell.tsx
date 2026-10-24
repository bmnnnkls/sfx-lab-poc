import { automationSlotsOf, type ControlOwner } from '@core'
import { editAutomationSlot, openAutomationSlot, useEngineControls, useProjectStore, useStatusStore } from '@state'
import styles from './SessionView.module.css'

/** A dedicated automation-only cell. An empty cell explicitly stops this owner at the next bar. */
export const AutomationSlotCell = ({ owner, scene }: { owner: ControlOwner; scene: number }) => {
  const slot = useProjectStore((s) => automationSlotsOf(s.project, owner)?.[scene])
  const status = useStatusStore((s) => owner.kind === 'master' ? s.status?.masterAutomation : s.status?.tracks[owner.trackId])
  const controls = useEngineControls()
  const select = () => openAutomationSlot(owner, scene)
  const playing = slot && status?.playingClipId === slot.id
  const queued = slot ? status?.queued === slot.id : status?.queued === 'stop'
  const label = owner.kind === 'master' ? 'Master' : useProjectStore.getState().project.tracks.find((t) => t.id === owner.trackId)?.name ?? 'Return'
  return <div data-automation-owner={label} data-scene={scene} className={`${styles.slot} ${styles.automationSlot} ${playing ? styles.playing : queued ? styles.queued : ''} ${!slot ? styles.empty : ''}`}>
    <button className={styles.launch} aria-label={`${slot ? 'Launch' : 'Stop'} ${label} automation scene ${scene + 1}`} title={slot ? `${slot.lengthBeats} beats · automation only` : 'Empty slot: restore bases at next bar'} onClick={() => controls.launchAutomation(owner, slot?.id ?? null)}>{slot ? `▶ ${slot.name}` : '■'}</button>
    {slot ? <>{(playing || queued) && <button aria-label={`Stop ${label} automation scene ${scene + 1}`} onClick={() => controls.launchAutomation(owner, null)}>■</button>}<button aria-label={`Edit ${label} automation scene ${scene + 1}`} onClick={select}>✎</button><button aria-label={`Delete ${label} automation scene ${scene + 1}`} onClick={() => editAutomationSlot(owner, scene, null)}>×</button></> : <button aria-label={`Create ${label} automation scene ${scene + 1}`} onClick={() => { editAutomationSlot(owner, scene, { id: crypto.randomUUID(), name: 'Automation', lengthBeats: 4 }); select() }}>+</button>}
  </div>
}
