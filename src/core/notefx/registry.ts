import { documented } from '../dsp'
import { arpeggiatorEffect } from './arpeggiator'
import { echoEffect } from './echo'
import { chordEffect, scaleLockEffect, transposeEffect, velocityEffect } from './effects'
import { noteNodeDocs } from './node-docs'
import { clipNotesNode, noteOutNode, rangeSplitNode, trackNotesNode } from './nodes'
import type { NoteNodeDefinition } from './types'

/** Every kind of node the note graph knows: where notes come from, where they go, and what happens in between. */
const plainNoteDefinitions: readonly NoteNodeDefinition[] = [
  clipNotesNode,
  trackNotesNode,
  scaleLockEffect,
  transposeEffect,
  chordEffect,
  velocityEffect,
  arpeggiatorEffect,
  echoEffect,
  rangeSplitNode,
  noteOutNode,
]

export const noteNodeDefinitions: readonly NoteNodeDefinition[] = plainNoteDefinitions.map((definition) => documented(definition, noteNodeDocs[definition.type]))

const byType = new Map(noteNodeDefinitions.map((definition) => [definition.type, definition]))

export const findNoteNode = (type: string): NoteNodeDefinition | undefined => byType.get(type)
