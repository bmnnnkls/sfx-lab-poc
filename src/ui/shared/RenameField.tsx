import { type Subject, commitRename, sameSubject, useRenameStore } from '@state'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { useActionContext, ViewOrigin } from './menu/action-context'
import styles from './RenameField.module.css'

interface RenameFieldProps {
  readonly name: string
  /** The field's accessible name, such as "Name of Bass". */
  readonly label: string
  readonly placeholder?: string
  readonly className?: string
  /** An in-place rename selects the name when it shows; a field that is always there doesn't. */
  readonly select?: boolean
  /** Whether an empty name may be committed (a control's name falls back to its parameter's). */
  readonly allowEmpty?: boolean
  onCommit(name: string): void
  /** After committing or cancelling. */
  onDone?(): void
}

/**
 * A text field for a name. Commits on Enter and when it loses focus, cancels on Escape, and refuses an empty name
 * (keeping the old one) unless `allowEmpty`. A name that didn't change isn't committed.
 */
export const RenameField = ({ name, label, placeholder, className, select = false, allowEmpty = false, onCommit, onDone }: RenameFieldProps) => {
  const [draft, setDraft] = useState<string | undefined>(undefined)
  // After Escape, or once an in-place field is done, the blur that follows must not commit.
  const ignoreBlur = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  // A task later: a menu that started the rename keeps the focus in itself until it has closed.
  useEffect(() => {
    if (!select) return
    const timer = setTimeout(() => {
      input.current?.focus()
      input.current?.select()
    })
    return () => clearTimeout(timer)
  }, [select])
  const done = () => {
    setDraft(undefined)
    if (!onDone) return
    ignoreBlur.current = true
    onDone()
  }
  const commit = () => {
    const typed = draft ?? name
    if (typed !== name && (allowEmpty || typed.trim() !== '')) onCommit(typed)
    done()
  }
  return (
    <input
      ref={input}
      className={`${styles.field} ${className ?? ''}`}
      value={draft ?? name}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (ignoreBlur.current) ignoreBlur.current = !!onDone
        else commit()
      }}
      onClick={(event) => event.stopPropagation()}
      // The browser's own menu (cut, copy, paste), not the menu of the thing being named.
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          if (onDone) commit()
          else event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          if (onDone) return done()
          setDraft(undefined)
          ignoreBlur.current = true
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/** Whether `subject` is being renamed in the view this component is in. */
export const useRenaming = (subject: Subject): boolean => {
  const origin = useContext(ViewOrigin)
  return useRenameStore((state) => !!state.renaming && state.renaming.origin === origin && sameSubject(state.renaming.subject, subject))
}

interface InPlaceRenameProps {
  readonly subject: Subject
  readonly name: string
  readonly label: string
  readonly className?: string
  /** Instead of the kind's own commit, for a view that reports the result itself (the Library's status line). */
  onCommit?(name: string): void
  /** The name as the view draws it, shown while it isn't being renamed. */
  readonly children: ReactNode
}

/** Draws `children`, or while `subject` is being renamed in this view, a field in their place. */
export const InPlaceRename = ({ subject, name, label, className, onCommit, children }: InPlaceRenameProps) => {
  const renaming = useRenaming(subject)
  const context = useActionContext()
  if (!renaming) return children
  return (
    <RenameField
      name={name}
      label={label}
      className={className}
      select
      onCommit={onCommit ?? ((typed) => void commitRename(subject, typed, context))}
      onDone={() => useRenameStore.getState().stop()}
    />
  )
}
