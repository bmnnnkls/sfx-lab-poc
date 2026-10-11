import { arpeggiatorEffect } from './arpeggiator'
import { echoEffect } from './echo'
import { chordEffect, scaleLockEffect, transposeEffect, velocityEffect } from './effects'
import type { NoteEffectDefinition } from './types'

export const noteEffectDefinitions: readonly NoteEffectDefinition[] = [
  scaleLockEffect,
  transposeEffect,
  chordEffect,
  velocityEffect,
  arpeggiatorEffect,
  echoEffect,
]

const byType = new Map(noteEffectDefinitions.map((definition) => [definition.type, definition]))

export const findNoteEffect = (type: string): NoteEffectDefinition | undefined => byType.get(type)
