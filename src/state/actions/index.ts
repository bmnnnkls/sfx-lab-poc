import { usePersistenceStore } from '../persistence-store'
import { clipActions } from './clip'
import { controlActions } from './control'
import { laneActions } from './lane'
import { regionActions } from './region'
import { slotActions } from './slot'
import type { Action, ActionChoice, ActionContext, Subject, SubjectKind, SubjectOf } from './types'

export type { Action, ActionChoice, ActionContext, Subject, SubjectKind, SubjectOf } from './types'
export { duplicateSessionClip, placeOnArrangement } from './clip'

const lists: { readonly [K in SubjectKind]: readonly Action<SubjectOf<K>>[] } = {
  track: [],
  master: [],
  clip: clipActions,
  slot: slotActions,
  'automation-slot': [],
  scene: [],
  sample: [],
  'library-item': [],
  'library-folder': [],
  nodes: [],
  canvas: [],
  module: [],
  region: regionActions,
  lane: laneActions,
  control: controlActions,
  sound: [],
}

/** The actions of a subject's kind, in menu order. Nothing else picks actions. */
export const actionsFor = <S extends Subject>(subject: S): readonly Action<S>[] =>
  lists[subject.kind] as unknown as readonly Action<S>[]

/** What a menu shows for one action: hidden ones are left out, so this is only what applies. */
export interface ActionItem {
  readonly id: string
  readonly title: string
  readonly group: Action['group']
  readonly danger: boolean
  readonly enabled: boolean
  /** For an action that asks which one; drawn as a submenu, or inline as one entry per choice. */
  readonly choices?: readonly ActionChoice[]
  readonly inline: boolean
}

/** The entries a menu on `subject` shows now, in order. */
export const describeActions = (subject: Subject, context: ActionContext): readonly ActionItem[] =>
  actionsFor(subject)
    .filter((action) => action.applies?.(subject, context) ?? true)
    .map((action) => ({
      id: action.id,
      title: typeof action.title === 'string' ? action.title : action.title(subject, context),
      group: action.group,
      danger: !!action.danger,
      enabled: action.enabled?.(subject, context) ?? true,
      choices: action.choices?.(subject, context),
      inline: !!action.inline,
    }))

export interface RunOptions {
  /** For an action with choices: the chosen one's id. */
  readonly choice?: string
  /** Where an asynchronous action's message or error goes; the toasts by default. */
  readonly report?: (kind: 'info' | 'error', message: string) => void
}

const toToasts = (kind: 'info' | 'error', message: string) => usePersistenceStore.getState().notify(kind, message)

/**
 * Runs an action on a subject, as a menu entry or a button does, unless it doesn't apply or isn't enabled now. An
 * asynchronous action's message, or the error it throws, is reported when it settles.
 */
export const runAction = (id: string, subject: Subject, context: ActionContext, options: RunOptions = {}): void => {
  const action = actionsFor(subject).find((candidate) => candidate.id === id)
  if (!action || !(action.applies?.(subject, context) ?? true) || !(action.enabled?.(subject, context) ?? true)) return
  const result = action.run(subject, context, options.choice)
  if (!result) return
  const report = options.report ?? toToasts
  result.then(
    (message) => message && report('info', message),
    (error: unknown) => report('error', error instanceof Error ? error.message : String(error)),
  )
}
