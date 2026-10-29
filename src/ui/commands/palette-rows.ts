import { type Command, type CommandContext, describeActions, sameSubject, type Subject, subjectName } from '@state'
import type { PaletteRow } from './palette-model'

/** The rows of the commands that apply and are meant for the palette: one per choice for a command with choices. */
export const commandRows = (commands: readonly Command[], context: CommandContext, keyOf: (command: string) => string | undefined): PaletteRow[] =>
  commands.flatMap((command): PaletteRow[] => {
    if (command.palette === false || !(command.applies?.(context) ?? true)) return []
    const enabled = command.enabled?.(context) ?? true
    const label = command.label?.(context) ?? command.title
    const base = { takesFocus: false, category: command.category }
    if (!command.choices) {
      const key = keyOf(command.id)
      return [{
        ...base, id: `command:${command.id}`, label: `${command.category}: ${label}`, enabled,
        ...(key && { key }), ...(command.tooltip && { tooltip: command.tooltip }), target: { kind: 'command', command: command.id },
      }]
    }
    return command.choices(context).map((choice) => ({
      ...base, id: `command:${command.id}:${choice.id}`, label: `${label}: ${choice.title}`, enabled: enabled && choice.enabled !== false,
      ...(choice.tooltip && { tooltip: choice.tooltip }), target: { kind: 'command', command: command.id, choice: choice.id },
    }))
  })

/**
 * The rows of what can be done to the focus subjects, then to the selection subjects not already listed: exactly
 * `describeActions` for each, one row per choice as in a menu, named by the subject (*Bass: Duplicate*).
 */
export const subjectRows = (focus: readonly Subject[], selection: readonly Subject[], context: CommandContext): PaletteRow[] => {
  const subjects: Subject[] = []
  for (const subject of [...focus, ...selection]) if (!subjects.some((listed) => sameSubject(listed, subject))) subjects.push(subject)
  return subjects.flatMap((subject, place) => {
    const name = subjectName(subject)
    return describeActions(subject, context).flatMap((item): PaletteRow[] => {
      const base = { takesFocus: item.takesFocus, ...(item.tooltip && { tooltip: item.tooltip }) }
      if (!item.choices) {
        return [{ ...base, id: `subject:${place}:${item.id}`, label: `${name}: ${item.title}`, enabled: item.enabled, target: { kind: 'action', action: item.id, subject } }]
      }
      return item.choices.map((choice) => ({
        ...base,
        id: `subject:${place}:${item.id}:${choice.id}`,
        label: item.inline ? `${name}: ${choice.title}` : `${name}: ${item.title}: ${choice.title}`,
        enabled: item.enabled && choice.enabled !== false,
        target: { kind: 'action', action: item.id, subject, choice: choice.id },
      }))
    })
  })
}
