import type { ActionChoice, ActionContext, Subject } from '../actions'
import type { ProjectFiles } from '../project-files'

export type CommandCategory = 'View' | 'Layout' | 'File' | 'Transport' | 'Track' | 'Edit' | 'Help'

/** What a command runs with: an action's context, the project's files, and what the keyboard focus is on. */
export interface CommandContext extends ActionContext {
  readonly files: ProjectFiles
  /** What the keyboard focus is on, innermost first. Empty when nothing focused has a subject. */
  readonly focus: readonly Subject[]
}

/** Something the palette, a key or a menu can run that needs no subject. Subject actions stay in `state/actions/`. */
export interface Command {
  /** Stable: key overrides are saved by it. 'view.show.mixer', 'layout.toggle.panel'. */
  readonly id: string
  readonly category: CommandCategory
  /** The static name, as the shortcuts dialog lists it: *Toggle panel*. */
  readonly title: string
  /** What a menu or the palette shows now, when it differs from the title: *Hide panel*. */
  readonly label?: (context: CommandContext) => string
  readonly tooltip?: string
  /** False: keys and menus only (the edit verbs). */
  readonly palette?: boolean
  /** A held key runs it again on each repeat (undo, redo). Otherwise a repeat does nothing, and the browser gets nothing. */
  readonly repeat?: boolean
  /** False: no key can be set on it (a choice of named layouts, whose names change). */
  readonly bindable?: boolean
  /** Hidden when false. */
  applies?(context: CommandContext): boolean
  /** Shown but disabled when false. */
  enabled?(context: CommandContext): boolean
  /** For a command that asks which one: the palette shows one row per choice, a menu a submenu. */
  choices?(context: CommandContext): readonly ActionChoice[]
  /** An asynchronous command resolves with a message to show, or throws one. */
  run(context: CommandContext, choice?: string): void | Promise<string | void>
}
