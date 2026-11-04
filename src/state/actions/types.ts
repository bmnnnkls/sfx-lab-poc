import type { ControlOwner, ControlTarget, PatchTarget, TrackGraph } from '@core'
import type { EngineControls } from '../engine-controls'
import type { ViewId } from '../layout-store'
import type { PersonalLibrary } from '../library'
import type { NoticeAction } from '../persistence-store'
import type { SampleLibrary } from '../sample-library'
import type { WavePane } from '../wave-panes'

/** What was right-clicked: a small value with a kind and ids, never a component or a DOM element. */
export type Subject =
  // Instrument, audio and return tracks. `edge`: which side of it a dragged track or group lands on (drop targets only).
  | { readonly kind: 'track'; readonly trackId: string; readonly edge?: 'before' | 'after' }
  | { readonly kind: 'group'; readonly groupId: string; readonly edge?: 'before' | 'after' | 'inside' } // a group of tracks
  | { readonly kind: 'master' }
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string } // a session clip
  | { readonly kind: 'slot'; readonly trackId: string; readonly scene: number } // an empty session cell
  | { readonly kind: 'automation-slot'; readonly owner: ControlOwner; readonly scene: number }
  | { readonly kind: 'scene'; readonly scene: number }
  | { readonly kind: 'sample'; readonly sampleId: string }
  | { readonly kind: 'library-item'; readonly itemId: string }
  | { readonly kind: 'library-folder'; readonly folderId: string }
  | { readonly kind: 'library-root'; readonly root: 'mine' | 'trash' } // a root of the Library's tree
  | { readonly kind: 'nodes'; readonly target: PatchTarget; readonly path: readonly string[]; readonly nodeIds: readonly string[] }
  | { readonly kind: 'canvas'; readonly target: PatchTarget; readonly path: readonly string[]; readonly at: { readonly x: number; readonly y: number } }
  | { readonly kind: 'module'; readonly moduleId: string }
  | { readonly kind: 'region'; readonly regionId: string }
  | { readonly kind: 'lane'; readonly trackId: string; readonly beat: number }
  | { readonly kind: 'control'; readonly targets: readonly ControlTarget[] }
  | { readonly kind: 'sound'; readonly soundId: string; readonly preset: boolean }
  | { readonly kind: 'pin'; readonly owner: ControlOwner; readonly graph: TrackGraph } // a front panel in the Pinned view
  | { readonly kind: 'sample-selection'; readonly sampleId: string; readonly pane: WavePane } // a Wave editor pane's lanes: its selection and cursor
  | { readonly kind: 'sample-marker'; readonly sampleId: string; readonly pane: WavePane; readonly markerId: string } // in a pane's mark lane
  | { readonly kind: 'sample-region'; readonly sampleId: string; readonly pane: WavePane; readonly regionId: string }
  | { readonly kind: 'sample-loop'; readonly sampleId: string; readonly pane: WavePane }
  | { readonly kind: 'arrangement-marker'; readonly markerId: string } // in the arrangement's mark lane
  | { readonly kind: 'arrangement-loop' } // the arrangement's loop brace
  | { readonly kind: 'arrangement-timeline'; readonly beat: number } // the mark lane's empty space, or the focused timeline

export type SubjectKind = Subject['kind']
export type SubjectOf<K extends SubjectKind> = Extract<Subject, { kind: K }>

/**
 * What actions can't import: the services that are React contexts, and the view the menu was opened in. The project,
 * selection, status and clipboards are read from their stores when an action runs or the menu draws.
 */
export interface ActionContext {
  readonly engine: EngineControls
  readonly samples: SampleLibrary
  readonly library: PersonalLibrary
  /** The view the menu (or button) is in, where an in-place rename shows; null outside a view. */
  readonly origin: ViewId | null
}

/** One of the things an action can be run on, such as a clip to add or an XY pad's axis. */
export interface ActionChoice {
  readonly id: string
  readonly title: string
  readonly enabled?: boolean
  /** What the choice is, when its title doesn't say enough (an example's tagline). */
  readonly tooltip?: string
  /** Drawn as a checkable entry, with a check mark when true: the one in effect, or last used (a fade's curve). */
  readonly checked?: boolean
}

/** What an asynchronous action resolves with: a message, and a button for its toast (*Show*). */
export interface ActionReport {
  readonly message: string
  readonly action?: NoticeAction
}

/** What an edit key does to the focused thing: Delete, ⌘D, ⌘C, ⌘X, ⌘V and F2. */
export type Verb = 'delete' | 'duplicate' | 'copy' | 'cut' | 'paste' | 'rename'

export interface Action<S extends Subject = Subject> {
  /** 'clip.duplicate': stable, and what the palette and a test know an action by. */
  readonly id: string
  /**
   * The edit key that runs it on the focused thing (`runVerb`). At most one action of a kind per verb. Left off the
   * deletes that remove more than the thing itself (*Delete group and tracks*, *Clear this track*).
   */
  readonly verb?: Verb
  readonly title: string | ((subject: S, context: ActionContext) => string)
  /** Entries are drawn in groups, with a separator between groups: open, edit, clipboard, delete, process, marks, view. */
  readonly group: 'open' | 'edit' | 'clipboard' | 'delete' | 'process' | 'marks' | 'view'
  readonly danger?: boolean
  /** Drawn after a separator inside its group, set apart from the entries before it (*Revert to original*). */
  readonly separated?: boolean
  /** What the entry does, when its title doesn't say enough: drawn as its tooltip. */
  readonly tooltip?: (subject: S, context: ActionContext) => string | undefined
  /** It moves the focus to a field of its own (an in-place rename), so the menu doesn't return it to the trigger. */
  readonly takesFocus?: boolean
  /** Hidden when false: the action makes no sense here (Stop on a return). */
  applies?(subject: S, context: ActionContext): boolean
  /** Shown but disabled when false: it makes sense, but not now (Paste with an empty clipboard). */
  enabled?(subject: S, context: ActionContext): boolean
  /**
   * For an action that asks which one: what it can be run on. Drawn as a submenu under the title, or with `inline`
   * as one entry per choice, titled by the choice. `run` gets the chosen id. `inline` can depend on the subject (a
   * track with one graph to pin has one entry).
   */
  choices?(subject: S, context: ActionContext): readonly ActionChoice[]
  readonly inline?: boolean | ((subject: S, context: ActionContext) => boolean)
  /** An asynchronous action resolves with a message to show, or throws one. */
  run(subject: S, context: ActionContext, choice?: string): void | Promise<string | ActionReport | void>
}
