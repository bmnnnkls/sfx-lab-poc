import { describe, expect, it } from 'vitest'
import { type ElementLike, isChromeTarget, isTextEntry, scopeHolds, usesSpaceOrEnter } from './scopes'

/** An element as the rules see it; `inside` lists the selectors `closest` finds. */
const element = (tagName: string, { type, role, href, editable, inside = [] }: { type?: string; role?: string; href?: boolean; editable?: boolean; inside?: readonly string[] } = {}): ElementLike => ({
  tagName,
  ...(type !== undefined && { type }),
  isContentEditable: !!editable,
  getAttribute: (name) => (name === 'role' ? role ?? null : null),
  hasAttribute: (name) => name === 'href' && !!href,
  closest: (selector) => (inside.some((inner) => selector.includes(inner)) ? {} : null),
})

describe('scope rules', () => {
  it('count text-like inputs, textareas, selects and contenteditable as text entry', () => {
    expect(isTextEntry(element('INPUT', { type: 'text' }))).toBe(true)
    expect(isTextEntry(element('INPUT', { type: 'number' }))).toBe(true)
    expect(isTextEntry(element('TEXTAREA'))).toBe(true)
    expect(isTextEntry(element('SELECT'))).toBe(true)
    expect(isTextEntry(element('DIV', { editable: true }))).toBe(true)
    expect(isTextEntry(element('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(isTextEntry(element('INPUT', { type: 'range' }))).toBe(false)
    expect(isTextEntry(element('BUTTON'))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })

  it('find the chrome by what holds the element', () => {
    expect(isChromeTarget(element('DIV', { role: 'tab', inside: ['[role="tab"]'] }))).toBe(true)
    expect(isChromeTarget(element('BUTTON', { inside: ['[data-activity-bar]'] }))).toBe(true)
    expect(isChromeTarget(element('INPUT', { inside: ['dialog'] }))).toBe(true)
    expect(isChromeTarget(element('DIV'))).toBe(false)
  })

  it('find the elements that use Space or Enter themselves', () => {
    expect(usesSpaceOrEnter(element('BUTTON'))).toBe(true)
    expect(usesSpaceOrEnter(element('A', { href: true }))).toBe(true)
    expect(usesSpaceOrEnter(element('A'))).toBe(false)
    expect(usesSpaceOrEnter(element('INPUT', { type: 'checkbox' }))).toBe(true)
    for (const role of ['switch', 'option', 'menuitem', 'treeitem', 'checkbox']) expect(usesSpaceOrEnter(element('DIV', { role }))).toBe(true)
    expect(usesSpaceOrEnter(element('DIV', { role: 'slider' }))).toBe(false)
    expect(usesSpaceOrEnter(element('DIV', { role: 'region' }))).toBe(false)
    expect(usesSpaceOrEnter(element('DIV'))).toBe(false)
  })

  it('hold text everywhere, outside-text outside fields, workspace also outside the chrome and buttons', () => {
    const field = element('INPUT', { type: 'text' })
    const button = element('BUTTON')
    const tab = element('DIV', { role: 'tab', inside: ['[role="tab"]'] })
    const canvas = element('DIV', { role: 'application' })
    expect([field, button, tab, canvas, null].map((target) => scopeHolds('text', target))).toEqual([true, true, true, true, true])
    expect([field, button, tab, canvas, null].map((target) => scopeHolds('outside-text', target))).toEqual([false, true, true, true, true])
    expect([field, button, tab, canvas, null].map((target) => scopeHolds('workspace', target))).toEqual([false, false, false, true, true])
  })
})
