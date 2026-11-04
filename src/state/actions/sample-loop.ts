import { setLoop } from '@core'
import { useProjectStore } from '../project-store'
import { playWaveRange, selectWaveRange, zoomWaveTo } from '../wave-marks'
import { openWave } from '../wave-edits'
import { isWavePreviewing } from '../wave-view'
import type { Action, SubjectOf } from './types'

type LoopSubject = SubjectOf<'sample-loop'>

const loopOf = (subject: LoopSubject) => openWave(subject)?.sample.loop
const exists = (subject: LoopSubject) => loopOf(subject) !== undefined

const actions: readonly Action<LoopSubject>[] = [
  {
    id: 'sample-loop.select',
    title: 'Select',
    group: 'open',
    tooltip: () => 'Select the loop',
    run: (subject) => {
      const loop = loopOf(subject)
      if (loop) selectWaveRange(subject, loop)
    },
  },
  {
    id: 'sample-loop.clear',
    verb: 'delete',
    title: 'Clear loop',
    group: 'delete',
    tooltip: () => 'A sampler in loop mode repeats from Start to the end again',
    run: ({ sampleId }) => useProjectStore.getState().editSampleMarks(sampleId, (info) => setLoop(info, null)),
  },
  {
    id: 'sample-loop.play',
    title: ({ sampleId }) => (isWavePreviewing(sampleId) ? 'Stop' : 'Play loop'),
    group: 'view',
    run: (subject, { samples }) => {
      const loop = loopOf(subject)
      if (loop) playWaveRange(samples, subject.sampleId, loop, true)
    },
  },
  {
    id: 'sample-loop.zoom',
    title: 'Zoom to loop',
    group: 'view',
    run: (subject) => {
      const loop = loopOf(subject)
      if (loop) zoomWaveTo(subject, loop)
    },
  },
]

/** A sample's loop in the Wave editor's mark lane, from its right-click menu, the palette and the edit keys. */
export const sampleLoopActions: readonly Action<LoopSubject>[] = actions.map((action) => ({ ...action, applies: exists }))
