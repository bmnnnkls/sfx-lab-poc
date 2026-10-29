import type { Subject } from '@state'
import { type RefObject, useEffect, useRef } from 'react'

/** What an element is about: its `ActionMenu`'s subject, and the subjects a view puts in its place. */
interface Recorded {
  menu?: () => Subject | null
  own?: () => readonly Subject[]
}

const recorded = new WeakMap<Element, Recorded>()

const entryOf = (element: Element): Recorded => {
  const entry = recorded.get(element) ?? {}
  recorded.set(element, entry)
  return entry
}

/** `ActionMenu`'s trigger records the subject it shows a menu for; read when a key is pressed. Returns the cleanup. */
export const recordMenuSubject = (element: Element, subject: () => Subject | null): (() => void) => {
  const entry = entryOf(element)
  entry.menu = subject
  return () => {
    if (entry.menu === subject) delete entry.menu
  }
}

/**
 * What the keyboard focus is on: the subjects of the elements around `element`, innermost first. An element a view
 * gave subjects of its own (the graph's selection and canvas) gives those instead of its menu's.
 */
export const focusSubjects = (element: Element | null): readonly Subject[] => {
  const subjects: Subject[] = []
  for (let node = element; node; node = node.parentElement) {
    const entry = recorded.get(node)
    const menu = entry?.menu?.()
    if (entry?.own) subjects.push(...entry.own())
    else if (menu) subjects.push(menu)
  }
  return subjects
}

/**
 * A view's own subjects for a focused element, in place of its menu's: the graph canvas gives its selection and the
 * canvas at the pointer. Read when a key is pressed or the palette opens, so `subjects` may read refs.
 */
export const useFocusSubjects = (ref: RefObject<Element | null>, subjects: () => readonly Subject[]): void => {
  const latest = useRef(subjects)
  useEffect(() => {
    latest.current = subjects
  })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const entry = entryOf(element)
    const read = () => latest.current()
    entry.own = read
    return () => {
      if (entry.own === read) delete entry.own
    }
  }, [ref])
}
