import { type Notice, usePersistenceStore } from '@state'
import { useEffect } from 'react'
import { Icon } from '../shared/icon'
import styles from './ToastStack.module.css'

const AUTO_DISMISS_MS = 5000
/** A confirmation that carries lines to read (how to start an example) stays long enough to read them. */
const READING_MS = 30000
/** A confirmation with a button (*Show*) stays long enough to reach it. */
const ACTION_MS = 10000

const Toast = ({ notice }: { notice: Notice }) => {
  const dismiss = usePersistenceStore((state) => state.dismiss)

  // Plain confirmations fade away; warnings and errors stay until acknowledged.
  useEffect(() => {
    if (notice.kind !== 'info') return
    const timer = setTimeout(() => dismiss(notice.id), notice.details.length > 0 ? READING_MS : notice.action ? ACTION_MS : AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notice, dismiss])

  return (
    <div className={`${styles.toast} ${styles[notice.kind]}`} role="status">
      <div className={styles.body}>
        <strong>{notice.message}</strong>
        {notice.details.length > 0 && (
          <ul>
            {notice.details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      {notice.action && (
        <button
          className={styles.action}
          onClick={() => {
            dismiss(notice.id)
            notice.action!.run()
          }}
        >
          {notice.action.label}
        </button>
      )}
      <button onClick={() => dismiss(notice.id)} aria-label="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

/** Floating messages about loading, importing and saving. Overlays the page, so it never shifts layout. */
export const ToastStack = () => {
  const notices = usePersistenceStore((state) => state.notices)
  return (
    <div className={styles.stack}>
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} />
      ))}
    </div>
  )
}
