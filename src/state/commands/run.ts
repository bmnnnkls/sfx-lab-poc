import { type RunOptions, settle } from '../actions'
import type { Command, CommandContext } from './types'

/** Whether `runCommand` would run a command now, with that choice. */
export const canRunCommand = (command: Command, context: CommandContext, choice?: string): boolean => {
  if (!(command.applies?.(context) ?? true) || !(command.enabled?.(context) ?? true)) return false
  return choice === undefined || !!command.choices?.(context).some((candidate) => candidate.id === choice && (candidate.enabled ?? true))
}

/**
 * Runs a command, as a key, a menu entry or the palette does, unless it doesn't apply or isn't enabled now. An
 * asynchronous command's message or error is reported as `runAction` reports an action's.
 */
export const runCommand = (command: Command, context: CommandContext, choice?: string, report?: RunOptions['report']): void | Promise<void> => {
  if (!canRunCommand(command, context, choice)) return
  return settle(command.run(context, choice), report)
}

/** A command's tooltip now: its own text, or what it says for this context (why it is disabled). */
export const commandTooltip = (command: Command, context: CommandContext): string | undefined =>
  typeof command.tooltip === 'function' ? command.tooltip(context) : command.tooltip
