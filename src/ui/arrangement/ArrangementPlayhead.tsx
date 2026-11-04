import { useArrangementView, useStatusStore } from '@state'
import { type RefObject, useEffect, useRef } from 'react'
import { followScroll } from './timeline-geometry'
import { followTo, forgetFollow, movedSinceFollow, pauseFollowIfPlaying } from './use-follow'
import { visibleTimeline } from './use-timeline-zoom'
import styles from './arrangement.module.css'

/**
 * The moving line across every lane while the arrangement plays (not while the session does). One for the whole
 * timeline, owning its status subscription so nothing else re-renders at the status rate. With follow on, it scrolls
 * the timeline when it leaves the view, writing `scrollLeft` itself, so following renders no other component.
 */
export const ArrangementPlayhead = ({ pxPerBeat, scroller }: { pxPerBeat: number; scroller: RefObject<HTMLDivElement | null> }) => {
  const beat = useStatusStore((state) => (state.status?.playing && state.status.mode === 'arrangement' ? state.status.beat : null))
  const follow = useArrangementView((state) => state.follow && state.following)

  // Follow turned on again (▶, the toggle): where it last scrolled to no longer says anything.
  const wasFollowing = useRef(follow)
  useEffect(() => {
    const element = scroller.current
    const resumed = follow && !wasFollowing.current
    wasFollowing.current = follow
    if (!element) return
    if (beat === null || resumed) forgetFollow(element)
    if (beat === null || !follow) return
    // Moved by the user since follow's last scroll, though the scroll event hasn't said so yet: pause instead.
    if (movedSinceFollow(element)) return pauseFollowIfPlaying()
    const left = followScroll(beat * pxPerBeat, element.scrollLeft, visibleTimeline(element).width)
    if (left !== null) followTo(element, left)
  }, [beat, follow, pxPerBeat, scroller])

  if (beat === null) return null
  return <div className={styles.playhead} data-testid="arrangement-playhead" style={{ left: beat * pxPerBeat }} />
}

/** Where arrangement playback starts: a line over the lanes. */
export const ArrangementPosition = ({ pxPerBeat }: { pxPerBeat: number }) => {
  const position = useArrangementView((state) => state.position)
  return <div className={styles.position} data-testid="arrangement-position" data-beat={position} style={{ left: position * pxPerBeat }} />
}

/** The position's mark in the ruler. */
export const PositionMark = ({ pxPerBeat }: { pxPerBeat: number }) => {
  const position = useArrangementView((state) => state.position)
  return <div className={styles.positionMark} style={{ left: position * pxPerBeat }} aria-hidden />
}
