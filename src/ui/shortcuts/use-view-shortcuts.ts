import { useLayoutStore } from '@state'
import { useEffect } from 'react'

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

/**
 * The workbench's own chrome, where Tab moves the focus as usual: a tab, a splitter, the activity bar, the region
 * toggles, a tab group's buttons (flexlayout marks them with their layout path) and dialogs.
 */
const isChromeTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="tab"], [role="separator"], [data-activity-bar], [data-region-toggles], button[data-layout-path], dialog') !== null

/** Tab switches between the session grid and the arrangement, as in Ableton, except in form fields and the chrome. */
export const useViewShortcuts = (): void => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target) || isChromeTarget(event.target)) return
      event.preventDefault()
      useLayoutStore.getState().toggleMainView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
