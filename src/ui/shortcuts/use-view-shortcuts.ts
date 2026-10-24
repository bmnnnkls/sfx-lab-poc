import { useLayoutStore } from '@state'
import { useEffect } from 'react'

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

/** Tab switches between the session grid and the arrangement, as in Ableton. */
export const useViewShortcuts = (): void => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      event.preventDefault()
      useLayoutStore.getState().toggleMainView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
