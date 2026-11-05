import { type Command, type CommandContext, commandTooltip, runCommand, useLayoutStore, useLibraryStore, usePersistenceStore, useProjectStore, useSelectionStore, useTouchStore } from '@state'
import type { MenuEntry } from '../shared/menu'
import { useKeybindingsContext } from './CommandHost'
import { keysOf } from './keybindings'
import { IS_APPLE, keyLabel } from './keys'
import { useLayoutNames } from './layout-names'
import { commandById } from './registry'

/**
 * What a menu built from commands lists: a command by id; a command with a label of the menu's own, or with its
 * choices inline (the named layouts in *Layout*); a submenu of items; or a separator.
 */
export type CommandMenuItem =
  | string
  | { readonly command: string; readonly label?: string; readonly inline?: boolean }
  | { readonly submenu: string; readonly items: readonly CommandMenuItem[] }

export const SEPARATOR = '—'

/** Drops the separators a missing command leaves at either end or next to another. */
const tidy = (entries: readonly MenuEntry[]): MenuEntry[] => {
  const kept: MenuEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'separator' && (kept.length === 0 || kept.at(-1)!.kind === 'separator')) continue
    kept.push(entry)
  }
  if (kept.at(-1)?.kind === 'separator') kept.pop()
  return kept
}

/**
 * The entries of a menu from commands: each shows its label now and its key, disabled when it isn't enabled, hidden
 * when it doesn't apply; a command with choices is a submenu, or one entry per choice inline.
 */
export const menuEntriesOf = (
  items: readonly CommandMenuItem[],
  context: CommandContext,
  keyOf: (command: string) => string | undefined,
  run: (command: Command, choice?: string) => void = (command, choice) => void runCommand(command, context, choice),
): MenuEntry[] =>
  tidy(items.flatMap((item): MenuEntry[] => {
    if (item === SEPARATOR) return [{ kind: 'separator' }]
    if (typeof item !== 'string' && 'submenu' in item) {
      const entries = menuEntriesOf(item.items, context, keyOf, run)
      return entries.length > 0 ? [{ kind: 'submenu', label: item.submenu, entries }] : []
    }
    const { command: id, label: ownLabel, inline } = typeof item === 'string' ? { command: item } : item
    const command = commandById(id)
    if (!command || !(command.applies?.(context) ?? true)) return []
    const enabled = command.enabled?.(context) ?? true
    const label = ownLabel ?? command.label?.(context) ?? command.title
    const common = { ...(command.danger && { danger: true }), ...(command.takesFocus && { takesFocus: true }) }
    if (command.choices) {
      const choices = command.choices(context).map((choice): MenuEntry => ({
        ...common,
        label: choice.title,
        disabled: !enabled || choice.enabled === false,
        ...(choice.tooltip && { tooltip: choice.tooltip }),
        onSelect: () => run(command, choice.id),
      }))
      if (choices.length === 0) return []
      return inline ? choices : [{ kind: 'submenu', label, entries: choices }]
    }
    const key = keyOf(command.id)
    const tooltip = commandTooltip(command, context)
    return [{
      ...common,
      label,
      disabled: !enabled,
      ...(key && { shortcut: key }),
      ...(tooltip && { tooltip }),
      onSelect: () => run(command),
    }]
  }))

/**
 * A menu's entries from commands, for `PopupMenu`'s builder: called only while the menu is open, it follows what the
 * labels and states read (the regions, the backup, undo, Touch, the selection, the library, the named layouts) while it stays open.
 */
export const useCommandEntries = (items: readonly CommandMenuItem[]): readonly MenuEntry[] => {
  const { bindings, services } = useKeybindingsContext()
  const context: CommandContext = { ...services, origin: null, focus: [] }
  const keyOf = (command: string) => {
    const key = keysOf(bindings, command)[0]
    return key === undefined ? undefined : keyLabel(key, IS_APPLE)
  }
  const signature = () => JSON.stringify(menuEntriesOf(items, context, keyOf))
  useLayoutStore(signature)
  usePersistenceStore(signature)
  useProjectStore(signature)
  useTouchStore(signature)
  useSelectionStore(signature)
  useLibraryStore(signature)
  useLayoutNames()
  return menuEntriesOf(items, context, keyOf)
}
