import { useArrangementView, useStatusStore } from '@state'
import { type RefObject, useEffect } from 'react'

/** Where follow last scrolled the timeline to, kept on the scroller; none while the arrangement isn't playing. */
const followedLeft = (scroller: HTMLElement): number | null => {
  const marked = scroller.dataset.followLeft
  return marked === undefined ? null : Number(marked)
}

/** Whether something other than follow moved the timeline sideways since follow last scrolled it. */
export const movedSinceFollow = (scroller: HTMLElement): boolean => {
  const left = followedLeft(scroller)
  return left !== null && Math.abs(left - scroller.scrollLeft) >= 1
}

/** Scrolls the timeline for follow, marked so the scroll it causes isn't taken for the user's. */
export const followTo = (scroller: HTMLElement, left: number): void => {
  scroller.scrollLeft = left
  scroller.dataset.followLeft = String(scroller.scrollLeft)
}

/** Forgets follow's last scroll, once playback stops, so the next ▶ starts afresh. */
export const forgetFollow = (scroller: HTMLElement): void => {
  delete scroller.dataset.followLeft
}

/** The user scrolled while the arrangement plays and follows: follow waits for the next ▶ or the toggle. */
export const pauseFollowIfPlaying = (): void => {
  const status = useStatusStore.getState().status
  const view = useArrangementView.getState()
  if (status?.playing && status.mode === 'arrangement' && view.follow) view.suspendFollow()
}

/**
 * Pauses follow when the user scrolls the timeline sideways while the arrangement plays (a wheel, a trackpad, a
 * middle-drag, a zoom, the scrollbar). Follow's own scrolls are told apart by where it left the timeline; the playhead
 * also checks that mark before it scrolls (`movedSinceFollow`), since its next frame can come before the scroll event.
 */
export const useFollowPause = (scroller: RefObject<HTMLDivElement | null>): void => {
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    let left = element.scrollLeft
    const onScroll = () => {
      if (element.scrollLeft === left) return
      left = element.scrollLeft
      if (movedSinceFollow(element) || followedLeft(element) === null) pauseFollowIfPlaying()
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [scroller])
}
