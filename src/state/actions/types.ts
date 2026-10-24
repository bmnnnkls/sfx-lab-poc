import type { ControlOwner, ControlTarget, PatchTarget } from '@core'
import type { EngineControls } from '../engine-controls'
import type { ViewId } from '../layout-store'
import type { PersonalLibrary } from '../library'
import type { SampleLibrary } from '../sample-library'

/** What was right-clicked: a small value with a kind and ids, never a component or a DOM element. */
export type Subject =
  | { readonly kind: 'track'; readonly trackId: string } // instrument, audio and return tracks
  | { readonly kind: 'master' }
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string } // a session clip
  | { readonly kind: 'slot'; readonly trackId: string; readonly scene: number } // an empty session cell
  | { readonly kind: 'automation-slot'; readonly owner: ControlOwner; readonly scene: number }
  | { readonly kind: 'scene'; readonly scene: number }
  | { readonly kind: 'sample'; readonly sampleId: string }
  | { readonly kind: 'library-item'; readonly itemId: string }
  | { readonly kind: 'library-folder'; readonly folderId: string }
  | { readonly kind: 'nodes'; readonly target: PatchTarget; readonly path: readonly string[]; readonly nodeIds: readonly string[] }
  | { readonly kind: 'canvas'; readonly target: PatchTarget; readonly path: readonly string[]; readonly at: { readonly x: number; readonly y: number } }
  | { readonly kind: 'module'; readonly moduleId: string }
  | { readonly kind: 'region'; readonly regionId: string }
  | { readonly kind: 'lane'; readonly trackId: string; readonly beat: number }
  | { readonly kind: 'control'; readonly targets: readonly ControlTarget[] }
  | { readonly kind: 'sound'; readonly soundId: string; readonly preset: boolean }

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
}

export interface Action<S extends Subject = Subject> {
  /** 'clip.duplicate': round 10's command ids. */
  readonly id: string
  readonly title: string | ((subject: S, context: ActionContext) => string)
  /** Entries are drawn in groups, with a separator between groups: open, edit, clipboard, delete. */
  readonly group: 'open' | 'edit' | 'clipboard' | 'delete'
  readonly danger?: boolean
  /** Hidden when false: the action makes no sense here (Stop on a return). */
  applies?(subject: S, context: ActionContext): boolean
  /** Shown but disabled when false: it makes sense, but not now (Paste with an empty clipboard). */
  enabled?(subject: S, context: ActionContext): boolean
  /**
   * For an action that asks which one: what it can be run on. Drawn as a submenu under the title, or with `inline`
   * as one entry per choice, titled by the choice. `run` gets the chosen id.
   */
  choices?(subject: S, context: ActionContext): readonly ActionChoice[]
  readonly inline?: boolean
  /** An asynchronous action resolves with a message to show, or throws one. */
  run(subject: S, context: ActionContext, choice?: string): void | Promise<string | void>
}
