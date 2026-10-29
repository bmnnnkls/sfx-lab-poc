import { actionsFor, runAction } from '.'
import type { Action, ActionContext, Subject, Verb } from './types'

/**
 * The action an edit key runs: across `subjects` (the focused thing first, then what holds it), the first action with
 * that verb that applies and is enabled, with its subject. Undefined when none has one.
 */
export const verbTarget = (verb: Verb, subjects: readonly Subject[], context: ActionContext): { action: Action; subject: Subject } | undefined => {
  for (const subject of subjects) {
    const action = actionsFor(subject).find((candidate) => candidate.verb === verb)
    if (action && (action.applies?.(subject, context) ?? true) && (action.enabled?.(subject, context) ?? true)) return { action, subject }
  }
  return undefined
}

/** Runs an edit key's action on the focused thing (see `verbTarget`), and says whether it ran one. */
export const runVerb = (verb: Verb, subjects: readonly Subject[], context: ActionContext): boolean => {
  const target = verbTarget(verb, subjects, context)
  if (!target) return false
  void runAction(target.action.id, target.subject, context)
  return true
}
