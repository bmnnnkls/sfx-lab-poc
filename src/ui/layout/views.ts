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

export interface ViewDescriptor {
  /** Tab label, also the accessible name tests use. Keep `ViewTitle` in tests/browser/fixtures.ts in sync. */
  readonly title: string
  readonly tooltip?: string
  /** Takes no props: a view reads its data from the stores and never assumes where it is docked. */
  readonly component: ComponentType
}

/** Every view the workbench can mount, by id. Adding an id to `ViewId` without a view here fails the typecheck. */
export const views: Readonly<Record<ViewId, ViewDescriptor>> = {
  session: { title: 'Session', tooltip: 'Session view (Tab)', component: SessionView },
  arrangement: { title: 'Arrangement', tooltip: 'Arrangement view (Tab)', component: ArrangementView },
  instrument: { title: 'Instrument', component: Patcher },
  effects: {
    title: 'Effects',
    tooltip: "Effects: process the track's sound after the instrument (or the samples) and before the fader",
    component: FxPanel,
  },
  notes: { title: 'Notes', tooltip: 'MIDI effects: change the notes before they reach the instrument', component: NoteEffectsPanel },
  clip: { title: 'Clip', component: ClipEditor },
  mixer: { title: 'Mixer', tooltip: 'Mixer: a channel strip for every track, the returns and the master', component: MixerPanel },
  samples: { title: 'Samples', component: SamplesPanel },
  sounds: { title: 'Sounds', component: PresetsPanel },
  library: { title: 'Library', component: LibraryView },
}
