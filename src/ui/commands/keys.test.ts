import { describe, expect, it } from 'vitest'
import { type KeyEventLike, keyLabel, keyOf, normalizeKey } from './keys'

const event = (key: string, code: string, held: Partial<Pick<KeyEventLike, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {}): KeyEventLike => ({
  key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...held,
})

describe('keyOf', () => {
  it.each([
    ['⌘Z on Apple', event('z', 'KeyZ', { metaKey: true }), true, 'mod+z'],
    ['Ctrl+Z elsewhere', event('z', 'KeyZ', { ctrlKey: true }), false, 'mod+z'],
    ['⇧⌘Z: the shifted letter', event('Z', 'KeyZ', { metaKey: true, shiftKey: true }), true, 'mod+shift+z'],
    ['⌃⌘B on Apple', event('b', 'KeyB', { ctrlKey: true, metaKey: true }), true, 'ctrl+mod+b'],
    ['⌥⌘B, whose key is "∫", by its code', event('∫', 'KeyB', { altKey: true, metaKey: true }), true, 'mod+alt+b'],
    ['AltGr+Q elsewhere ("@"), by its code', event('@', 'KeyQ', { ctrlKey: true, altKey: true }), false, 'mod+alt+q'],
    ["AZERTY's ⌘A (the Q key) by its letter", event('a', 'KeyQ', { metaKey: true }), true, 'mod+a'],
    ['a Cyrillic layout by its code', event('и', 'KeyB', { ctrlKey: true }), false, 'mod+b'],
    ['a shifted digit by its code', event('!', 'Digit1', { shiftKey: true }), false, 'shift+1'],
    ["Backspace on Apple: its ⌫, called delete", event('Backspace', 'Backspace'), true, 'delete'],
    ["Delete on Apple: its ⌦", event('Delete', 'Delete'), true, 'forwarddelete'],
    ['Backspace elsewhere', event('Backspace', 'Backspace'), false, 'backspace'],
    ['Delete elsewhere', event('Delete', 'Delete'), false, 'delete'],
    ['F6', event('F6', 'F6'), true, 'f6'],
    ['Shift+F6', event('F6', 'F6', { shiftKey: true }), false, 'shift+f6'],
    ['F2', event('F2', 'F2'), true, 'f2'],
    ['Space', event(' ', 'Space'), true, 'space'],
    ['Tab', event('Tab', 'Tab'), false, 'tab'],
    ['an arrow', event('ArrowUp', 'ArrowUp', { altKey: true }), true, 'alt+arrowup'],
    ['the Windows key elsewhere', event('k', 'KeyK', { metaKey: true }), false, 'meta+k'],
  ])('%s', (_name, input, apple, expected) => {
    expect(keyOf(input, apple)).toBe(expected)
  })

  it('names no key for a modifier alone or a dead key', () => {
    expect(keyOf(event('Meta', 'MetaLeft', { metaKey: true }), true)).toBeUndefined()
    expect(keyOf(event('Shift', 'ShiftLeft', { shiftKey: true }), false)).toBeUndefined()
    expect(keyOf(event('Dead', 'Quote'), false)).toBeUndefined()
  })
})

describe('normalizeKey', () => {
  it('puts the modifiers in order and refuses what is not a key', () => {
    expect(normalizeKey('Shift+Mod+Z')).toBe('mod+shift+z')
    expect(normalizeKey('mod+ctrl+b')).toBe('ctrl+mod+b')
    expect(normalizeKey('f6')).toBe('f6')
    expect(normalizeKey('mod+mod+z')).toBeUndefined()
    expect(normalizeKey('hyper+z')).toBeUndefined()
    expect(normalizeKey('mod+shift')).toBeUndefined()
    expect(normalizeKey('')).toBeUndefined()
  })
})

describe('keyLabel', () => {
  it.each([
    ['ctrl+mod+shift+b', '⌃⇧⌘B', 'Ctrl+Shift+B'],
    ['mod+alt+shift+b', '⌥⇧⌘B', 'Ctrl+Alt+Shift+B'],
    ['mod+shift+z', '⇧⌘Z', 'Ctrl+Shift+Z'],
    ['mod+k', '⌘K', 'Ctrl+K'],
    ['delete', '⌫', 'Delete'],
    ['forwarddelete', '⌦', 'Forwarddelete'],
    ['backspace', 'Backspace', 'Backspace'],
    ['shift+f6', '⇧F6', 'Shift+F6'],
    ['space', 'Space', 'Space'],
    ['tab', '⇥', 'Tab'],
    ['alt+p', '⌥P', 'Alt+P'],
  ])('%s', (key, apple, other) => {
    expect(keyLabel(key, true)).toBe(apple)
    expect(keyLabel(key, false)).toBe(other)
  })
})
