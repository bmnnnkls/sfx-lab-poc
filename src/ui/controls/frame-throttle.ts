/**
 * Passes on at most one value per animation frame. A drag can deliver pointer events faster than the screen draws, and
 * every value that reaches the project is re-flattened and diffed, so only the latest one of each frame is worth sending.
 * `flush` sends a waiting value at once (the end of a drag must not lose its last position).
 */
export interface FrameThrottle<T> {
  push(value: T): void
  flush(): void
  cancel(): void
}

export const createFrameThrottle = <T>(
  send: (value: T) => void,
  schedule: (run: () => void) => number = (run) => requestAnimationFrame(run),
  unschedule: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
): FrameThrottle<T> => {
  let waiting: { value: T } | undefined
  let handle: number | undefined

  const flush = () => {
    if (handle !== undefined) unschedule(handle)
    handle = undefined
    if (!waiting) return
    const { value } = waiting
    waiting = undefined
    send(value)
  }
  return {
    push: (value) => {
      waiting = { value }
      handle ??= schedule(flush)
    },
    flush,
    cancel: () => {
      if (handle !== undefined) unschedule(handle)
      handle = undefined
      waiting = undefined
    },
  }
}
