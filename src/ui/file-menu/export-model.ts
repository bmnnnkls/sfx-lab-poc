import {
  type BounceOptions,
  type BounceSampleRate,
  type BounceScope,
  DEFAULT_BOUNCE_SAMPLE_RATE,
  DEFAULT_MAX_TAIL,
  MAX_BOUNCE_BARS,
  MAX_TAIL_LIMIT,
  MIN_BOUNCE_BARS,
  type Project,
  defaultBounceBars,
} from '@core'

/** What the export dialog asks, as the fields hold it. A field the user has not touched is null and follows its default. */
export interface ExportForm {
  readonly scope: 'clip' | 'scene'
  /** Index of the scene (row) of the session grid, from 0. */
  readonly scene: number
  readonly bars: string | null
  readonly tail: string
  readonly sampleRate: BounceSampleRate
  readonly bitDepth: 16 | 32
  readonly normalize: boolean
}

export const initialForm = (hasClip: boolean): ExportForm => ({
  scope: hasClip ? 'clip' : 'scene',
  scene: 0,
  bars: null,
  tail: String(DEFAULT_MAX_TAIL),
  sampleRate: DEFAULT_BOUNCE_SAMPLE_RATE,
  bitDepth: 16,
  normalize: false,
})

export interface ClipChoice {
  readonly scope: Extract<BounceScope, { kind: 'clip' }>
  /** "Track name: clip name", for the dialog. */
  readonly label: string
}

/** The clip that is open in the editor, if it is one a bounce can play (a clip of an instrument or audio track that exists). */
export const selectedClipChoice = (project: Project, trackId: string | null, clipId: string | null): ClipChoice | null => {
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  if (!track || track.kind === 'return' || clipId === null) return null
  const clip = track.clips.find((candidate) => candidate?.id === clipId)
  return clip ? { scope: { kind: 'clip', trackId: track.id, clipId }, label: `${track.name}: ${clip.name}` } : null
}

/** How many clips the scene (row) has: a scene without any has nothing to export. */
export const sceneClipCount = (project: Project, scene: number): number =>
  project.tracks.filter((track) => track.kind !== 'return' && track.clips[scene] != null).length

/** The scope the form asks for, or null if there is nothing to play there. */
export const scopeOf = (form: ExportForm, project: Project, choice: ClipChoice | null): BounceScope | null => {
  if (form.scope === 'clip') return choice?.scope ?? null
  return sceneClipCount(project, form.scene) > 0 ? { kind: 'scene', scene: form.scene } : null
}

/** A number typed in a field; anything that is not a finite number is the fallback. */
export const readNumber = (text: string | null, fallback: number): number => {
  if (text === null || text.trim() === '') return fallback
  const value = Number(text)
  return Number.isFinite(value) ? value : fallback
}

/** The bars the form asks for, kept in the range a bounce accepts; untouched, the scope played once through. */
export const barsOf = (form: ExportForm, project: Project, scope: BounceScope): number => {
  const bars = readNumber(form.bars, defaultBounceBars(project, scope))
  return Math.min(MAX_BOUNCE_BARS, Math.max(MIN_BOUNCE_BARS, bars))
}

/** What the field shows while untouched: the default, without float dust ("0.5", "2"). */
export const barsText = (form: ExportForm, project: Project, scope: BounceScope | null): string =>
  form.bars ?? (scope ? String(Number(defaultBounceBars(project, scope).toFixed(3))) : '')

export const optionsOf = (form: ExportForm, project: Project, scope: BounceScope): BounceOptions => ({
  scope,
  bars: barsOf(form, project, scope),
  maxTail: Math.min(MAX_TAIL_LIMIT, Math.max(0, readNumber(form.tail, DEFAULT_MAX_TAIL))),
  sampleRate: form.sampleRate,
  bitDepth: form.bitDepth,
  normalize: form.normalize,
})
