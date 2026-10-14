import type { MidiBinding } from '@core'
import { create } from 'zustand'

/** `off`: not asked for yet. `unsupported`: the browser has no Web MIDI. `denied`: the user or the browser said no. */
export type MidiStatus = 'off' | 'unsupported' | 'denied' | 'on'

/** A control waiting for a controller to be moved: the next CC message is bound to it. */
export interface MidiLearning {
  readonly nodeId: string
  /** The graph the control lives in (the panel's scope), so the same node id in another graph is not mistaken for it. */
  readonly scope: string
  /** Writes the binding onto the control (its panel knows which graph that is). */
  assign(binding: MidiBinding): void
}

interface MidiState {
  readonly status: MidiStatus
  /** The names of the connected inputs. */
  readonly devices: readonly string[]
  /** The last message received, as the status line shows it. */
  readonly last: string | null
  readonly learning: MidiLearning | null
  /** Asks the browser for MIDI; set by the app at start-up (the UI only calls it). */
  readonly enable: () => void
  setStatus(status: MidiStatus): void
  setDevices(devices: readonly string[]): void
  setLast(last: string): void
  learn(learning: MidiLearning | null): void
}

/** Web MIDI as the UI sees it: whether it is on, what is plugged in, what came last, and which control is learning. */
export const useMidiStore = create<MidiState>((set) => ({
  status: 'off',
  devices: [],
  last: null,
  learning: null,
  enable: () => undefined,
  setStatus: (status) => set({ status }),
  setDevices: (devices) => set({ devices }),
  setLast: (last) => set({ last }),
  learn: (learning) => set({ learning }),
}))
