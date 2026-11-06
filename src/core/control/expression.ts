import { MIDI_CC_TYPE, type ParamSpec } from '../dsp'
import { BEND_RANGE, ccLabel, clampBendRange, EXPRESSION_REST, type ExpressionControl, isExpressionCC } from '../midi'
import { flattenPatch } from '../patch'
import type { Project } from '../project'
import type { ControlResolution, ExpressionTarget } from './types'

/** The CC every instrument track offers a lane for, whether or not its patch reads it. */
export const MOD_WHEEL_CC = 1

/** Why an expression lane on anything but an instrument track doesn't play. */
export const EXPRESSION_OWNER_REASON = 'Only an instrument track has pitch bend, pressure and CC'

/** An expression target's value range and how it reads: the bend in semitones at `bendRange`, the rest 0 to 127. */
export const expressionSpec = (target: ExpressionTarget, bendRange: number = BEND_RANGE.default): ParamSpec =>
  target.control === 'pitchBend' ? { id: 'pitchBend', label: 'Pitch bend', min: -1, max: 1, default: EXPRESSION_REST, unit: 'st', format: 'bend', displayScale: clampBendRange(bendRange) }
    : target.control === 'pressure' ? { id: 'pressure', label: 'Pressure', min: 0, max: 1, default: EXPRESSION_REST, format: 'midi7' }
    : { id: `cc${target.cc}`, label: `CC ${ccLabel(target.cc)}`, min: 0, max: 1, default: EXPRESSION_REST, format: 'midi7' }

export const resolveExpressionTarget = (project: Project, target: ExpressionTarget): ControlResolution => {
  const owner = target.owner
  const track = owner.kind === 'track' ? project.tracks.find((candidate) => candidate.id === owner.trackId) : undefined
  if (owner.kind === 'track' && !track) return { status: 'missing', reason: 'Owner track is missing' }
  if (track?.kind !== 'instrument') return { status: 'incompatible', reason: EXPRESSION_OWNER_REASON }
  if (target.control === 'cc' && !isExpressionCC(target.cc)) return { status: 'incompatible', reason: 'A CC lane takes CC 0 to 119, but not 64 (the sustain pedal)' }
  return { status: 'available', spec: expressionSpec(target, track.bendRange), baseValue: EXPRESSION_REST, automatable: true, interpolation: 'linear' }
}

/** The CCs an instrument track's patch reads through MIDI CC nodes, modules included, in order and once each. */
const patchCCs = (project: Project, trackId: string): number[] => {
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  if (track?.kind !== 'instrument') return []
  const ccs = flattenPatch(track.patch, project.modules).nodes
    .filter((node) => node.type === MIDI_CC_TYPE)
    .map((node) => Math.round(node.params.cc ?? MOD_WHEEL_CC))
    .filter(isExpressionCC)
  return [...new Set(ccs)].sort((a, b) => a - b)
}

/**
 * The expression lanes an instrument track offers in the pickers: Pitch bend, Pressure, the mod wheel, then the CCs its
 * patch's MIDI CC nodes read. Any other CC is added by number. Nothing for another owner.
 */
export const expressionTargets = (project: Project, trackId: string): ExpressionTarget[] => {
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  if (track?.kind !== 'instrument') return []
  const owner = { kind: 'track' as const, trackId }
  return [
    { kind: 'expression', owner, control: 'pitchBend' },
    { kind: 'expression', owner, control: 'pressure' },
    ...[...new Set([MOD_WHEEL_CC, ...patchCCs(project, trackId)])].map((cc): ExpressionTarget => ({ kind: 'expression', owner, control: 'cc', cc })),
  ]
}

/** The lane target for what a keyboard sends to a track. */
export const expressionTarget = (trackId: string, control: ExpressionControl): ExpressionTarget => {
  const owner = { kind: 'track' as const, trackId }
  return typeof control === 'string' ? { kind: 'expression', owner, control } : { kind: 'expression', owner, control: 'cc', cc: control.cc }
}

/** *Pitch bend*, *Pressure*, *CC 1 Mod wheel*. */
export const expressionLabel = (target: ExpressionTarget): string =>
  target.control === 'pitchBend' ? 'Pitch bend' : target.control === 'pressure' ? 'Pressure' : `CC ${ccLabel(target.cc)}`
