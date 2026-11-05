import { usePersistenceStore } from '../persistence-store'
import { arrangementLoopActions, arrangementMarkerActions, arrangementTimelineActions } from './arrangement-marks'
import { timelineLaneActions } from './timeline-lane'
import { automationSlotActions } from './automation-slot'
import { clipActions } from './clip'
import { controlActions } from './control'
import { groupActions } from './group'
import { laneActions } from './lane'
import { libraryFolderActions, libraryItemActions, libraryRootActions } from './library'
import { libraryFolderClipboardActions, libraryItemClipboardActions, libraryRootClipboardActions } from './library-clipboard'
import { masterActions } from './master'
import { moduleActions } from './module'
import { canvasActions, nodeActions } from './nodes'
import { pinActions } from './pin'
import { projectGraphActions } from './project-graph'
import { regionActions } from './region'
import { sampleActions } from './sample'
import { sampleLoopActions } from './sample-loop'
import { sampleMarkerActions } from './sample-marker'
import { sampleRegionActions } from './sample-region'
import { sampleSelectionActions } from './sample-selection'
import { sceneActions } from './scene'
import { slotActions } from './slot'
import { soundActions } from './sound'
import { trackActions } from './track'
import type { NoticeAction } from '../persistence-store'
import type { Action, ActionChoice, ActionContext, ActionReport, Subject, SubjectKind, SubjectOf } from './types'

export type { Action, ActionChoice, ActionContext, ActionReport, Subject, SubjectKind, SubjectOf, Verb } from './types'
export { runVerb, verbTarget } from './verbs'
export { subjectName } from './subject-name'
export { duplicateSessionClip, placeOnArrangement } from './clip'
export { commitRename, startRename } from './rename'
export { clipTrackFor, graphFitsOwner, insertLibraryClipAt, insertionScope, isInstrumentItem, libraryClipFitsSlot, replaceGraph } from './library'
export { canPasteClipOnLane, pasteClipOnLane } from './lane'
export { copyName, projectGraphItem, projectGraphItemId } from './project-graph'
export { canPasteClipInSlot, pasteClipInSlot } from './slot'
export { ARM_TOOLTIP } from './track'
export { canRecallPresetOn, nextSoundName, recallablePresets, recallPresetOn, saveSound, soundSubject } from './sound'
export { automationSlotClipboard, clipClipboard, libraryClipboard, nodeClipboard, type CopiedClip, type CopiedGraphNodes, type LibraryClip, type LibraryClipEntry } from './clipboards'
export { editTargetOf, graphKeyOf } from './nodes'
export { processActions } from './sample-selection'
export { markerTitle, toggleArrangementLoop } from './arrangement-marks'
export { readLane, showControl, timelineLaneOf } from './timeline-lane'

const GROUP_ORDER: readonly Action['group'][] = ['open', 'edit', 'clipboard', 'delete', 'process', 'marks', 'view']

/** Two lists of one kind as one, in group order: `extra`'s entries after the entries of their group in `list`. */
const merged = <S extends Subject>(list: readonly Action<S>[], extra: readonly Action<S>[]): readonly Action<S>[] =>
  [...list, ...extra].map((action, index) => ({ action, index })).sort((a, b) => GROUP_ORDER.indexOf(a.action.group) - GROUP_ORDER.indexOf(b.action.group) || a.index - b.index).map(({ action }) => action)

const lists: { readonly [K in SubjectKind]: readonly Action<SubjectOf<K>>[] } = {
  track: trackActions,
  group: groupActions,
  master: masterActions,
  clip: clipActions,
  slot: slotActions,
  'automation-slot': automationSlotActions,
  scene: sceneActions,
  sample: sampleActions,
  'library-item': merged(libraryItemActions, libraryItemClipboardActions),
  'library-folder': merged(libraryFolderActions, libraryFolderClipboardActions),
  'library-root': merged(libraryRootActions, libraryRootClipboardActions),
  'project-graph': projectGraphActions,
  nodes: nodeActions,
  canvas: canvasActions,
  module: moduleActions,
  region: regionActions,
  lane: laneActions,
  control: controlActions,
  sound: soundActions,
  pin: pinActions,
  'sample-selection': sampleSelectionActions,
  'sample-marker': sampleMarkerActions,
  'sample-region': sampleRegionActions,
  'sample-loop': sampleLoopActions,
  'arrangement-marker': arrangementMarkerActions,
  'arrangement-loop': arrangementLoopActions,
  'arrangement-timeline': arrangementTimelineActions,
  'timeline-lane': timelineLaneActions,
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
  /** A separator comes before it, inside its group. */
  readonly separated: boolean
  readonly tooltip?: string
  readonly takesFocus: boolean
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
      separated: !!action.separated,
      ...(action.tooltip && { tooltip: action.tooltip(subject, context) }),
      takesFocus: !!action.takesFocus,
      enabled: action.enabled?.(subject, context) ?? true,
      choices: action.choices?.(subject, context),
      inline: typeof action.inline === 'function' ? action.inline(subject, context) : !!action.inline,
    }))

export interface RunOptions {
  /** For an action with choices: the chosen one's id. */
  readonly choice?: string
  /**
   * Where an asynchronous action's message or error goes; the toasts by default. `action` is the toast's button, which
   * a status line leaves out.
   */
  readonly report?: (kind: 'info' | 'error', message: string, action?: NoticeAction) => void
}

const toToasts = (kind: 'info' | 'error', message: string, action?: NoticeAction) => usePersistenceStore.getState().notify(kind, message, [], action)

/**
 * Runs an action on a subject, as a menu entry or a button does, unless it doesn't apply or isn't enabled now. An
 * asynchronous action's message, or the error it throws, is reported when it settles; the returned promise settles
 * after that.
 */
export const runAction = (id: string, subject: Subject, context: ActionContext, options: RunOptions = {}): void | Promise<void> => {
  const action = actionsFor(subject).find((candidate) => candidate.id === id)
  if (!action || !(action.applies?.(subject, context) ?? true) || !(action.enabled?.(subject, context) ?? true)) return
  return settle(action.run(subject, context, options.choice), options.report)
}

/**
 * Whether `runAction` would run an action on a subject now, with that choice: it applies, is enabled, and the choice
 * is one of its enabled choices.
 */
export const canRunAction = (id: string, subject: Subject, context: ActionContext, choice?: string): boolean => {
  const action = actionsFor(subject).find((candidate) => candidate.id === id)
  if (!action || !(action.applies?.(subject, context) ?? true) || !(action.enabled?.(subject, context) ?? true)) return false
  return choice === undefined || !!action.choices?.(subject, context).some((candidate) => candidate.id === choice && (candidate.enabled ?? true))
}

/** Reports what an asynchronous action (or drop) resolves with, or the error it throws; the promise settles after that. */
export const settle = (result: void | Promise<string | ActionReport | void>, report: RunOptions['report'] = toToasts): void | Promise<void> => {
  if (!result) return
  return result.then(
    (message) => {
      if (typeof message === 'string' && message) report('info', message)
      else if (message && typeof message === 'object') report('info', message.message, message.action)
    },
    (error: unknown) => report('error', error instanceof Error ? error.message : String(error)),
  )
}
