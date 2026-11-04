import { type ActionContext, type ActionItem, type Subject, describeActions, runAction, subscribeToClipboards, useProjectStore, useSampleStore, useStatusStore } from '@state'
import { type ReactElement, useCallback, useRef, useSyncExternalStore } from 'react'
import { useActionContext } from './action-context'
import { ContextMenu } from './ContextMenu'
import { recordMenuSubject } from './focus-subjects'
import { notingFocus } from './noting-focus'
import type { MenuEntry } from './menu-types'

/**
 * The entries for a subject's actions (those `only` keeps, all by default), built while its menu is open. Subscribes to
 * the stores the actions read, so an entry stays right if something changes while the menu is open (*Launch* turns into
 * *Restart*, *Paste* enables). Each is read through the entries themselves, so the status's 30 updates a second
 * re-render the menu only when an entry changes. An entry that moves the focus says so (`takesFocus`).
 */
export const useActionEntries = (subject: Subject, context: ActionContext, only: (item: ActionItem) => boolean = () => true): readonly MenuEntry[] => {
  const describe = () => describeActions(subject, context).filter(only)
  const signature = () => JSON.stringify(describe())
  useProjectStore(signature)
  useStatusStore(signature)
  useSampleStore(signature)
  useSyncExternalStore(subscribeToClipboards, signature)
  const entries: MenuEntry[] = []
  let group: string | undefined
  for (const item of describe()) {
    if (entries.length > 0 && (item.group !== group || item.separated)) entries.push({ kind: 'separator' })
    group = item.group
    const run = (choice?: string) => void runAction(item.id, subject, context, { choice })
    if (!item.choices) {
      entries.push({ label: item.title, danger: item.danger, disabled: !item.enabled, takesFocus: item.takesFocus, ...(item.tooltip && { tooltip: item.tooltip }), onSelect: () => run() })
    } else {
      const choices = item.choices.map((choice) => ({
        label: choice.title,
        danger: item.danger,
        disabled: !item.enabled || choice.enabled === false,
        takesFocus: item.takesFocus,
        ...(choice.checked !== undefined && { checked: choice.checked }),
        ...(choice.tooltip && { tooltip: choice.tooltip }),
        onSelect: () => run(choice.id),
      }))
      if (item.inline) entries.push(...choices)
      else entries.push({ kind: 'submenu', label: item.title, entries: choices, disabled: !item.enabled, ...(item.tooltip && { tooltip: item.tooltip }) })
    }
  }
  return entries
}

/**
 * The right-click menu of a thing: its kind's actions from `state/actions`, drawn with `ContextMenu`. Views only say
 * what `children` shows; a subject that depends on the click is set from `children`'s own `onContextMenu`, which runs
 * before the menu opens. With no subject, `children` is drawn without a menu.
 *
 * The trigger records its subject, so the edit keys and the palette know what the keyboard focus is on
 * (`focusSubjects`).
 */
export const ActionMenu = ({ subject, children }: { subject: Subject | null; children: ReactElement }) => {
  const context = useActionContext()
  // Set by an entry that moved the focus to a field of its own, which the trigger mustn't take back.
  const focusTaken = useRef(false)
  const current = useRef(subject)
  current.current = subject
  const trigger = useCallback((element: HTMLElement | null) => (element ? recordMenuSubject(element, () => current.current) : undefined), [])
  if (!subject) return children
  const closed = (event: Event) => {
    if (focusTaken.current) event.preventDefault()
    focusTaken.current = false
  }
  return (
    <ContextMenu entries={() => notingFocus(useActionEntries(subject, context), focusTaken)} onCloseAutoFocus={closed} triggerRef={trigger}>
      {children}
    </ContextMenu>
  )
}
