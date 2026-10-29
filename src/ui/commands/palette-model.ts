import type { CommandCategory, Subject } from '@state'
import { norm, tierOf } from '../shared/search-match'

/** What a row runs: a command (with its choice), or a subject's action (with its choice). */
export type PaletteTarget =
  | { readonly kind: 'command'; readonly command: string; readonly choice?: string }
  | { readonly kind: 'action'; readonly action: string; readonly subject: Subject; readonly choice?: string }

/** One row of the palette. */
export interface PaletteRow {
  /** Unique among the rows: a command's id and choice, or the subject's place and the action's id and choice. */
  readonly id: string
  /** "View: Show Mixer", "Load layout: Mix", "Bass: Duplicate". */
  readonly label: string
  /** The command's first key, drawn for this platform. */
  readonly key?: string
  readonly enabled: boolean
  readonly tooltip?: string
  /** It moves the focus to a field of its own (*Rename*), so closing doesn't put the focus back. */
  readonly takesFocus: boolean
  readonly category?: CommandCategory
  readonly target: PaletteTarget
}

export interface PaletteState {
  readonly query: string
  readonly active: number
}

export const INITIAL: PaletteState = { query: '', active: 0 }

/** How many commands run in this session the palette remembers, newest first. */
export const RECENT_LIMIT = 8

export const CATEGORY_ORDER: readonly CommandCategory[] = ['View', 'Layout', 'File', 'Transport', 'Track', 'Edit', 'Help']

/** The recent list after running a row: commands only, newest first, without repeats. */
export const withRecent = (recent: readonly string[], row: PaletteRow): readonly string[] =>
  row.target.kind === 'command' ? [row.id, ...recent.filter((id) => id !== row.id)].slice(0, RECENT_LIMIT) : recent

const isCommand = (row: PaletteRow) => row.target.kind === 'command'

/**
 * The rows to show, in order. With nothing typed: the commands run recently (newest first), then the subjects'
 * actions, then every other command by category. Typed: the matches, by how well they match (QuickAdd's tiers), then
 * the commands run recently, then commands before subject actions in the order given.
 */
export const rankRows = (rows: readonly PaletteRow[], query: string, recent: readonly string[]): readonly PaletteRow[] => {
  const recentRank = (row: PaletteRow) => {
    const index = recent.indexOf(row.id)
    return index === -1 ? recent.length : index
  }
  const wanted = norm(query).trim()
  if (wanted === '') {
    const recents = rows.filter((row) => isCommand(row) && recent.includes(row.id)).sort((a, b) => recentRank(a) - recentRank(b))
    const subjects = rows.filter((row) => !isCommand(row))
    const commands = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isCommand(row) && !recent.includes(row.id))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.row.category!) - CATEGORY_ORDER.indexOf(b.row.category!) || a.index - b.index)
      .map(({ row }) => row)
    return [...recents, ...subjects, ...commands]
  }
  return rows
    .map((row, index) => ({ row, index, tier: tierOf(wanted, row.label, [[row.category ?? '']]) }))
    .filter((hit): hit is { row: PaletteRow; index: number; tier: number } => hit.tier !== undefined)
    .sort((a, b) => a.tier - b.tier || recentRank(a.row) - recentRank(b.row) || Number(isCommand(b.row)) - Number(isCommand(a.row)) || a.index - b.index)
    .map((hit) => hit.row)
}

export type PaletteAction =
  | { readonly type: 'input'; readonly query: string }
  | { readonly type: 'key'; readonly key: string }
  | { readonly type: 'hover'; readonly index: number }
  | { readonly type: 'activate'; readonly index: number }

export interface PaletteResult {
  readonly state: PaletteState
  /** The user chose this row: close, then run it. */
  readonly run?: PaletteRow
  readonly close?: boolean
  /** The key did something the field must not also do (an arrow, Enter). */
  readonly handled: boolean
}

const wrap = (index: number, length: number): number => (length === 0 ? 0 : ((index % length) + length) % length)

/** A disabled row is shown, and says why in its title, but doesn't run. */
const activate = (rows: readonly PaletteRow[], state: PaletteState, index: number): PaletteResult => {
  const row = rows[index]
  if (!row || !row.enabled) return { state, handled: true }
  return { state, run: row, close: true, handled: true }
}

/** The palette's whole behaviour over the ranked rows, as a pure step, tested without a DOM. */
export const step = (rows: readonly PaletteRow[], state: PaletteState, action: PaletteAction): PaletteResult => {
  switch (action.type) {
    case 'input':
      return { state: { query: action.query, active: 0 }, handled: false }
    case 'hover':
      return { state: { ...state, active: action.index }, handled: false }
    case 'activate':
      return activate(rows, state, action.index)
    case 'key':
      switch (action.key) {
        case 'ArrowDown':
          return { state: { ...state, active: wrap(state.active + 1, rows.length) }, handled: true }
        case 'ArrowUp':
          return { state: { ...state, active: wrap(state.active - 1, rows.length) }, handled: true }
        case 'PageDown':
          return { state: { ...state, active: Math.max(0, Math.min(rows.length - 1, state.active + 8)) }, handled: true }
        case 'PageUp':
          return { state: { ...state, active: Math.max(0, state.active - 8) }, handled: true }
        case 'Enter':
          return activate(rows, state, state.active)
        case 'Escape':
          return { state, close: true, handled: true }
        default:
          return { state, handled: false }
      }
  }
}
