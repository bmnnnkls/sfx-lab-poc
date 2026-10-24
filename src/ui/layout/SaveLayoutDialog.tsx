import { useEffect, useRef, useState } from 'react'
import styles from './SaveLayoutDialog.module.css'

/**
 * *Save layout as…*: asks for a name. A name already in use asks once more before replacing that layout.
 */
export const SaveLayoutDialog = ({ names, onSave, onClose }: { names: readonly string[]; onSave(name: string): void; onClose(): void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [replacing, setReplacing] = useState(false)
  const trimmed = name.trim()
  const taken = names.includes(trimmed)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const save = () => {
    if (!trimmed) return
    if (taken && !replacing) return setReplacing(true)
    onSave(trimmed)
    onClose()
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Save layout" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <form method="dialog" className={styles.form} onSubmit={(event) => { event.preventDefault(); save() }}>
        <h2>Save layout</h2>
        <label className={styles.row}>
          <span>Name</span>
          <input
            aria-label="Layout name"
            value={name}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              setReplacing(false)
            }}
          />
        </label>
        {replacing && <p className={styles.warning} role="alert">A layout named “{trimmed}” is saved already. Replace it?</p>}
        <div className={styles.actions}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!trimmed}>{replacing ? 'Replace' : 'Save'}</button>
        </div>
      </form>
    </dialog>
  )
}
