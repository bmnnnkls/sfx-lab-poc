/** Helpers for reading values out of untrusted JSON. */

export type Raw = Record<string, unknown>
export type Warn = (message: string) => void

export const isRecord = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export const nonEmptyText = (value: unknown, fallback: string, maxLength: number): string =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, maxLength) : fallback

export const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
