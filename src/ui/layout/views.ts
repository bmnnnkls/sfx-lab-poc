import type { ViewId } from '@state'
import type { ComponentType } from 'react'
import { ArrangementView } from '../arrangement'
import { ClipEditor } from '../clip-editor/ClipEditor'
import { LibraryView } from '../library/LibraryView'
import { MixerPanel } from '../mixer/MixerPanel'
import { NoteEffectsPanel } from '../note-effects/NoteEffectsPanel'
import { FxPanel } from '../patcher/FxPanel'
import { Patcher } from '../patcher/Patcher'
import { PresetsPanel } from '../presets/PresetsPanel'
import { SamplesPanel } from '../samples/SamplesPanel'
import { SessionView } from '../session-view/SessionView'
import { viewTitles, viewTooltips } from './view-titles'

export interface ViewDescriptor {
  /** Tab label, from `viewTitles`. */
  readonly title: string
  /** From `viewTooltips`. */
  readonly tooltip?: string
  /** Takes no props: a view reads its data from the stores and never assumes where it is docked. */
  readonly component: ComponentType
}

/** Every view the workbench can mount, by id. Adding an id to `ViewId` without a view here fails the typecheck. */
export const views: Readonly<Record<ViewId, ViewDescriptor>> = {
  session: { title: viewTitles.session, tooltip: viewTooltips.session, component: SessionView },
  arrangement: { title: viewTitles.arrangement, tooltip: viewTooltips.arrangement, component: ArrangementView },
  instrument: { title: viewTitles.instrument, component: Patcher },
  effects: { title: viewTitles.effects, tooltip: viewTooltips.effects, component: FxPanel },
  notes: { title: viewTitles.notes, tooltip: viewTooltips.notes, component: NoteEffectsPanel },
  clip: { title: viewTitles.clip, component: ClipEditor },
  mixer: { title: viewTitles.mixer, tooltip: viewTooltips.mixer, component: MixerPanel },
  samples: { title: viewTitles.samples, component: SamplesPanel },
  sounds: { title: viewTitles.sounds, component: PresetsPanel },
  library: { title: viewTitles.library, component: LibraryView },
}
