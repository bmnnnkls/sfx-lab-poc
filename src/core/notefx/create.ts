import { createId } from '../shared'
import { findNoteEffect } from './registry'
import type { NoteEffect } from './types'

/** A new effect of `type` with every parameter at its default, or undefined for an unknown type. */
export const createNoteEffect = (type: string): NoteEffect | undefined => {
  const definition = findNoteEffect(type)
  if (!definition) return undefined
  return {
    id: createId('fx'),
    type,
    params: Object.fromEntries(definition.params.map((spec) => [spec.id, spec.default])),
    bypassed: false,
  }
}
