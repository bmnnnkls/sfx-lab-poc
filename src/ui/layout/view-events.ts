/**
 * Dispatched on a view's `data-view` root just before the shell hides the view. Its Effects are about to be cleaned
 * up while its state is kept, so a popup that should close with its view listens for this rather than closing in an
 * Effect cleanup (StrictMode's simulated unmount would close it as soon as it opens).
 */
export const VIEW_HIDE = 'view-hide'

/** Calls `onHide` when the view holding `element` is about to be hidden; returns the unsubscribe, for an Effect. */
export const onViewHide = (element: Element | null, onHide: () => void): (() => void) => {
  const root = element?.closest('[data-view]')
  root?.addEventListener(VIEW_HIDE, onHide)
  return () => root?.removeEventListener(VIEW_HIDE, onHide)
}
