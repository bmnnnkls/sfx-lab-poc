import { openClip, openSampleEditor, openTrackView } from '../navigation'
import { useProjectStore } from '../project-store'
import { useSampleStore } from '../sample-store'
import { copyToLibraryClipboard } from './clipboards'
import { saveToLibrary } from './library-save'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type SampleSubject = SubjectOf<'sample'>

const sampleOf = ({ sampleId }: SampleSubject) => project().samples.find((sample) => sample.id === sampleId)
const ready = ({ sampleId }: SampleSubject) => useSampleStore.getState().status[sampleId] === 'ready'
const lastTrack = () => project().tracks.at(-1)

/** A sample of the project, in the Samples list. */
export const sampleActions: readonly Action<SampleSubject>[] = [
  {
    id: 'sample.preview',
    title: 'Preview',
    group: 'open',
    enabled: ready,
    run: ({ sampleId }, { samples }) => samples.preview(sampleId),
  },
  {
    id: 'sample.open',
    title: 'Open in wave editor',
    group: 'open',
    enabled: ready,
    run: ({ sampleId }) => openSampleEditor(sampleId),
  },
  renameAction('sample'),
  {
    id: 'sample.new-sampler-track',
    title: 'New sampler track',
    group: 'edit',
    run: (subject) => {
      const sample = sampleOf(subject)
      if (!sample) return
      useProjectStore.getState().addSamplerTrack(sample)
      const added = lastTrack()
      if (added) openTrackView(added.id, 'instrument')
    },
  },
  {
    id: 'sample.new-audio-track',
    title: 'New audio track',
    group: 'edit',
    // An audio track that plays the sample as a looping clip, opened for editing.
    run: (subject) => {
      const sample = sampleOf(subject)
      if (!sample) return
      useProjectStore.getState().addAudioTrackFromSample(sample)
      const added = lastTrack()
      const clip = added?.kind === 'audio' ? added.clips[0] : null
      if (added && clip) openClip(added.id, clip.id)
    },
  },
  {
    id: 'sample.add-to-library',
    title: 'Add to library',
    group: 'edit',
    applies: (subject) => !!sampleOf(subject),
    run: ({ sampleId }, context) => saveToLibrary({ kind: 'sample', sampleId }, context),
  },
  {
    id: 'sample.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    // A sample row of This project, in the Library: onto the library's clipboard, so *Paste here* saves it.
    applies: (subject, { origin }) => origin === 'library' && !!sampleOf(subject),
    run: ({ sampleId }) => copyToLibraryClipboard([{ kind: 'sample', sampleId }]),
  },
  {
    id: 'sample.remove',
    verb: 'delete',
    title: 'Remove from project',
    group: 'delete',
    danger: true,
    run: ({ sampleId }) => useProjectStore.getState().removeSample(sampleId),
  },
]
