import { METRONOME_DEFAULT_DB, METRONOME_MAX_DB, METRONOME_MIN_DB } from '@core'
import { create } from 'zustand'

/** The fixed lengths a take can have, in bars; 0 is off (the take ends when the slot is pressed again). */
export const FIXED_LENGTHS = [0, 1, 2, 4, 8, 16] as const
export type FixedLength = (typeof FIXED_LENGTHS)[number]
/** The manual latency offset's range, in ms: a positive offset places recorded notes earlier. */
export const LATENCY_OFFSET_MS = { min: -50, max: 50 } as const

/** How recording runs, per browser: the metronome, the fixed length and the latency offset. Not part of the project. */
export interface RecordSettings {
  readonly metronome: boolean
  /** The click's level, in dB (`METRONOME_MIN_DB` to `METRONOME_MAX_DB`). */
  readonly metronomeLevel: number
  readonly fixedBars: FixedLength
  readonly latencyOffsetMs: number
}

export const DEFAULT_RECORD_SETTINGS: RecordSettings = { metronome: false, metronomeLevel: METRONOME_DEFAULT_DB, fixedBars: 0, latencyOffsetMs: 0 }

const clampNumber = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)))
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

interface RecordSettingsState extends RecordSettings {
  setMetronome(on: boolean): void
  /** Clamped to the metronome's range, in whole dB. */
  setMetronomeLevel(db: number): void
  setFixedBars(bars: FixedLength): void
  /** Clamped to `LATENCY_OFFSET_MS`, in whole ms. */
  setLatencyOffset(ms: number): void
  /** Takes what was saved, field by field: a value that isn't valid keeps the default. */
  restore(saved: unknown): void
}

/**
 * The record settings. `state` doesn't touch `localStorage`: `ui` restores them once and saves each change
 * (`useRecordSettingsStorage`).
 */
export const useRecordSettings = create<RecordSettingsState>((set) => ({
  ...DEFAULT_RECORD_SETTINGS,
  setMetronome: (metronome) => set({ metronome }),
  setMetronomeLevel: (db) => { if (Number.isFinite(db)) set({ metronomeLevel: clampNumber(db, METRONOME_MIN_DB, METRONOME_MAX_DB) }) },
  setFixedBars: (fixedBars) => { if (FIXED_LENGTHS.includes(fixedBars)) set({ fixedBars }) },
  setLatencyOffset: (ms) => { if (Number.isFinite(ms)) set({ latencyOffsetMs: clampNumber(ms, LATENCY_OFFSET_MS.min, LATENCY_OFFSET_MS.max) }) },
  restore: (saved) => {
    const value = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}
    set({
      metronome: typeof value.metronome === 'boolean' ? value.metronome : DEFAULT_RECORD_SETTINGS.metronome,
      metronomeLevel: finite(value.metronomeLevel) ? clampNumber(value.metronomeLevel, METRONOME_MIN_DB, METRONOME_MAX_DB) : DEFAULT_RECORD_SETTINGS.metronomeLevel,
      fixedBars: FIXED_LENGTHS.includes(value.fixedBars as FixedLength) ? (value.fixedBars as FixedLength) : DEFAULT_RECORD_SETTINGS.fixedBars,
      latencyOffsetMs: finite(value.latencyOffsetMs) ? clampNumber(value.latencyOffsetMs, LATENCY_OFFSET_MS.min, LATENCY_OFFSET_MS.max) : DEFAULT_RECORD_SETTINGS.latencyOffsetMs,
    })
  },
}))

/** The settings as saved: only the fields, no actions. */
export const recordSettingsOf = ({ metronome, metronomeLevel, fixedBars, latencyOffsetMs }: RecordSettings): RecordSettings => ({ metronome, metronomeLevel, fixedBars, latencyOffsetMs })
