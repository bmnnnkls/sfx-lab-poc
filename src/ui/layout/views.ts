import type { ViewId } from '@state'
import type { ComponentType } from 'react'
import { ArrangementView } from '../arrangement'
import { ClipEditor } from '../clip-editor/ClipEditor'
import { LibraryView } from '../library/LibraryView'
import { MixerPanel } from '../mixer/MixerPanel'
import { NoteEffectsPanel } from '../note-effects/NoteEffectsPanel'
import { FxPanel } from '../patcher/FxPanel'
import { Patcher } from '../patcher/Patcher'
import { PinnedView } from '../pinned/PinnedView'
import { SoundsPanel } from '../presets/SoundsPanel'
import { SamplesPanel } from '../samples/SamplesPanel'
import { SessionView } from '../session-view/SessionView'
import { TracksView } from '../tracks/TracksView'
import { WaveEditorView } from '../wave-editor/WaveEditorView'
import { type ViewMinSize, viewMinSizes, viewTitles, viewTooltips } from './view-titles'

export interface ViewDescriptor {
  /** Tab label, from `viewTitles`. */
  readonly title: string
  /** From `viewTooltips`. */
  readonly tooltip?: string
  /** From `viewMinSizes`: the least the view is laid out at. */
  readonly minSize: ViewMinSize
  /** Takes no props: a view reads its data from the stores and never assumes where it is docked. */
  readonly component: ComponentType
}

/** Every view the workbench can mount, by id. Adding an id to `ViewId` without a view here fails the typecheck. */
export const views: Readonly<Record<ViewId, ViewDescriptor>> = {
  session: { title: viewTitles.session, tooltip: viewTooltips.session, component: SessionView, minSize: viewMinSizes.session },
  arrangement: { title: viewTitles.arrangement, tooltip: viewTooltips.arrangement, component: ArrangementView, minSize: viewMinSizes.arrangement },
  wave: { title: viewTitles.wave, tooltip: viewTooltips.wave, component: WaveEditorView, minSize: viewMinSizes.wave },
  instrument: { title: viewTitles.instrument, component: Patcher, minSize: viewMinSizes.instrument },
  effects: { title: viewTitles.effects, tooltip: viewTooltips.effects, component: FxPanel, minSize: viewMinSizes.effects },
  notes: { title: viewTitles.notes, tooltip: viewTooltips.notes, component: NoteEffectsPanel, minSize: viewMinSizes.notes },
  clip: { title: viewTitles.clip, component: ClipEditor, minSize: viewMinSizes.clip },
  mixer: { title: viewTitles.mixer, tooltip: viewTooltips.mixer, component: MixerPanel, minSize: viewMinSizes.mixer },
  samples: { title: viewTitles.samples, component: SamplesPanel, minSize: viewMinSizes.samples },
  sounds: { title: viewTitles.sounds, component: SoundsPanel, minSize: viewMinSizes.sounds },
  library: { title: viewTitles.library, component: LibraryView, minSize: viewMinSizes.library },
  tracks: { title: viewTitles.tracks, tooltip: viewTooltips.tracks, component: TracksView, minSize: viewMinSizes.tracks },
  pinned: { title: viewTitles.pinned, tooltip: viewTooltips.pinned, component: PinnedView, minSize: viewMinSizes.pinned },
}
