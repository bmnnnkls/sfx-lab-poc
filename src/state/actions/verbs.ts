import { actionsFor, runAction } from '.'
import type { Action, ActionContext, Subject, Verb } from './types'

/**
 * The action an edit key runs, with its subject. `subjects` is what the focus is on, innermost first. The innermost
 * decides: its action with that verb, if that applies and is enabled. Paste alone walks out to the first subject that
 * takes a paste, since it goes into a place: Paste on a graph's selected nodes pastes on the canvas around them.
 * A focused fader in a mixer strip is the fader's, so Delete there never deletes the track.
 */
export const verbTarget = (verb: Verb, subjects: readonly Subject[], context: ActionContext): { action: Action; subject: Subject } | undefined => {
  for (const subject of verb === 'paste' ? subjects : subjects.slice(0, 1)) {
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
