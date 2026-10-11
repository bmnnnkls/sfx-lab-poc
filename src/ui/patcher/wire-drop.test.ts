import { describe, expect, it } from 'vitest'
import { createNode, describeNode } from '@core'
import { targetInput } from './wire-drop'

const into = (type: string, kind: Parameters<typeof targetInput>[1]) => targetInput(describeNode(createNode(type, 0, 0))!, kind)?.id

describe('targetInput', () => {
  it('a signal goes into a node\'s own input, not into a setting', () => {
    expect(into('filter', 'signal')).toBe('in')
    expect(into('gain', undefined)).toBe('in')
    expect(into('oscillator', 'signal')).toBe('freq')
  })

  it('a control with no input of its own to go to lands on a setting socket', () => {
    expect(into('oscillator', 'control')).toBe('freq') // a control also fits a signal input
    expect(into('control', 'control')).toBeUndefined() // a control has no inputs at all
    expect(into('envelope', 'control')).toBe('gate')
  })

  it('notes go to note inputs only; sound does not go to a note node, nor notes to a sound node', () => {
    expect(into('transpose', 'notes')).toBe('in')
    expect(into('transpose', 'signal')).toBe('param:semitones')
    expect(into('filter', 'notes')).toBeUndefined()
    expect(into('noteOut', 'notes')).toBe('in')
    expect(into('output', 'notes')).toBeUndefined()
  })

  it('stereo goes only to stereo inputs', () => {
    expect(into('width', 'stereo')).toBe('in')
    expect(into('filter', 'stereo')).toBeUndefined()
    expect(into('trackOut', 'stereo')).toBe('in')
  })

  it('a node with nothing that fits is undefined', () => {
    expect(into('note', 'signal')).toBeUndefined()
    expect(into('clipNotes', 'notes')).toBeUndefined()
  })
})
