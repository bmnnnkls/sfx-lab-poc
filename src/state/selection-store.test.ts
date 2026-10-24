import { type InstrumentTrack, createArrangementClip } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadDemo } from './actions/test-support'
import { useLayoutStore } from './layout-store'
import { openRegion } from './navigation'
import { useProjectStore } from './project-store'
import { useSelectionStore } from './selection-store'

const selection = () => useSelectionStore.getState()
const project = () => useProjectStore.getState().project

beforeEach(() => {
  loadDemo()
  selection().reset()
})

describe('the region selection', () => {
  it('selects a region with its track, instead of a session clip or the master', () => {
    selection().selectMaster()
    selection().selectClip('bass', 'root')
    selection().selectRegion('region', 'lead')
    expect(selection()).toMatchObject({ regionId: 'region', trackId: 'lead', clipId: null, master: false })
  })

  it('is cleared by selecting anything else but a sample, and by reset', () => {
    const cleared = {
      selectTrack: () => selection().selectTrack('pad'),
      selectMaster: () => selection().selectMaster(),
      selectClip: () => selection().selectClip('bass', 'root'),
      selectAutomation: () => selection().selectAutomation({ kind: 'master' }, 1),
      reset: () => selection().reset(),
    }
    for (const [name, select] of Object.entries(cleared)) {
      selection().selectRegion('region', 'lead')
      select()
      expect(selection().regionId, name).toBeNull()
    }
    selection().selectRegion('region', 'lead')
    selection().selectSample('kick')
    expect(selection()).toMatchObject({ regionId: 'region', sampleId: 'kick' })
  })

  it('opens a region: selects it and its track, and reveals Clip', () => {
    const bass = project().tracks[0] as InstrumentTrack
    useProjectStore.getState().addArrangementClip(bass.id, 4, bass.clips[0]!)
    const region = project().arrangement![0]!
    const revealed: string[] = []
    useLayoutStore.setState({ revealView: (id) => revealed.push(id) })
    openRegion(region.id)
    expect(selection()).toMatchObject({ regionId: region.id, trackId: bass.id })
    expect(revealed).toEqual(['clip'])
    openRegion('gone')
    expect(revealed).toEqual(['clip'])
  })

  it('follows a region moved to another lane', () => {
    const [bass, lead] = project().tracks as InstrumentTrack[]
    useProjectStore.getState().resetProject({ ...project(), arrangement: [createArrangementClip(bass!.id, 0, bass!.clips[0]!)] })
    const region = project().arrangement![0]!
    selection().selectRegion(region.id, bass!.id)
    useProjectStore.getState().updateArrangementClip(region.id, { trackId: lead!.id, startBeat: 4 })
    expect(selection()).toMatchObject({ regionId: region.id, trackId: lead!.id })
  })
})
