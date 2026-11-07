import { ARM_TOOLTIP, type SubjectOf, runAction, useRecordStore } from '@state'
import { Icon } from './icon'
import { useActionContext } from './menu'
import styles from './ArmButton.module.css'

/** The record dot on an instrument track's header: arms it for recording (`track.arm`). Red while armed. */
export const ArmButton = ({ trackId, name, className }: { trackId: string; name: string; className?: string }) => {
  const context = useActionContext()
  const armed = useRecordStore((state) => state.armed.includes(trackId))
  const subject: SubjectOf<'track'> = { kind: 'track', trackId }
  return (
    <button
      className={`${styles.arm} ${armed ? styles.armed : ''} ${className ?? ''}`}
      aria-pressed={armed}
      aria-label={`Arm ${name} for recording`}
      data-tooltip={ARM_TOOLTIP}
      onClick={() => runAction('track.arm', subject, context)}
    >
      <Icon name="record" filled size={14} />
    </button>
  )
}
