import { type ControlTarget, type MidiMapping, commit, resolveControlTarget, midiSourceKey } from '@core'
import { create } from 'zustand'
import { createContext, useContext } from 'react'
import { useProjectStore } from './project-store'

export interface MidiInputInfo { readonly id: string; readonly name: string; readonly connected: boolean }
export interface MidiService { enable(): Promise<void>; disable(): void; panic(): void }
const MidiContext = createContext<MidiService | null>(null)
export const MidiProvider = MidiContext.Provider
export const useMidi = (): MidiService => {
  const service = useContext(MidiContext)
  if (!service) throw new Error('MIDI provider missing')
  return service
}
interface MidiState {
  readonly status: 'disabled' | 'requesting' | 'enabled' | 'unsupported' | 'denied'
  readonly error?: string
  readonly inputs: readonly MidiInputInfo[]
  readonly disabledInputs: readonly string[]
  readonly channel: number | null
  readonly pinnedTrackId: string | null
  readonly learning?: { readonly target: ControlTarget; readonly replaceId?: string }
  readonly conflict?: { readonly mapping: MidiMapping; readonly existingId: string; readonly replaceId?: string }
  readonly feedback: Readonly<Record<string, { readonly state: 'pickup' | 'active' | 'unavailable'; readonly value?: number }>>
  /** *Recorded CCs* → *Learn*: the next unmapped CC that can be ticked is added, then this goes off. */
  readonly learningRecordedCC: boolean
  learn(target: ControlTarget, replaceId?: string): void
  cancelLearn(): void
  confirmReassign(): void
}
export const editMidiMappings = (edit: (mappings: readonly MidiMapping[]) => readonly MidiMapping[]) => {
  const state = useProjectStore.getState()
  const midiMappings = edit(state.project.midiMappings ?? [])
  const project = { ...state.project, midiMappings }
  useProjectStore.setState({ project, history: commit(state.history, project, { now: Date.now() }) })
}
export const useMidiStore = create<MidiState>((set, get) => ({
  status: 'disabled', inputs: [], disabledInputs: [], channel: null, pinnedTrackId: null, feedback: {}, learningRecordedCC: false,
  learn: (target, replaceId) => {
    const resolved = resolveControlTarget(useProjectStore.getState().project, target)
    if (resolved.status !== 'available' || !resolved.automatable) return
    set({ learning: { target, replaceId }, conflict: undefined })
  },
  cancelLearn: () => set({ learning: undefined, conflict: undefined }),
  confirmReassign: () => {
    const conflict = get().conflict
    if (!conflict) return
    editMidiMappings((mappings) => [...mappings.filter((m) => m.id !== conflict.existingId && m.id !== conflict.replaceId && midiSourceKey(m) !== midiSourceKey(conflict.mapping)), conflict.mapping])
    set({ conflict: undefined, learning: undefined })
  },
}))
