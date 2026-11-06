import { type ControlValue, controlTargetKey, commit, editControlBases } from '@core'
import { captureTouch, finishTouch, touchPositionNow, TOUCH_RELEASE_MS } from './touch-store'
import { useControlStore } from './control-store'
import { useProjectStore } from './project-store'
let serial = 0
/** Explicit gesture lifetime: long drags merge; consecutive drags cannot merge by timing accident. */
export const createControlGesture = () => {
  const source = `touch:${++serial}`
  let timer: ReturnType<typeof setTimeout> | undefined
  let timestamp: number | undefined
  let key: string | undefined
  let burst: { signature: string; key: string; at: number } | undefined
  return {
    stamp(at: number) { timestamp = at },
    begin() { key ??= `control-gesture:${++serial}`; burst = undefined },
    end(at?: number) { clearTimeout(timer); finishTouch(source, touchPositionNow(at === undefined ? 0 : Math.max(0, performance.now() - at))); key = undefined; burst = undefined; timestamp = undefined },
    change(changes: readonly ControlValue[], at = timestamp ?? performance.now()) {
      clearTimeout(timer)
      if (key === undefined) {
        const deadline = at + TOUCH_RELEASE_MS
        timer = setTimeout(() => finishTouch(source, touchPositionNow(Math.max(0, performance.now() - deadline))), Math.max(0, deadline - performance.now()))
      }
      const now = Date.now()
      // Wheel input has no native begin/end; merge only a short burst on the same controls.
      if (key === undefined) {
        const signature = changes.map((change) => controlTargetKey(change.target)).join('|')
        burst = burst?.signature === signature && now - burst.at <= 800
          ? { ...burst, at: now } : { signature, key: `control-burst:${++serial}`, at: now }
      }
      const controls = useControlStore.getState()
      const baseChanges = changes.filter((change) => {
        if (captureTouch(source, [change], Math.max(0, performance.now() - at))) return false
        const key = controlTargetKey(change.target)
        const automated = controls.playback.some((entry) => controlTargetKey(entry.target) === key)
        const overridden = controls.overrides.some((entry) => controlTargetKey(entry.target) === key)
        if (automated || overridden) { controls.setOverride(change.target, change.value); return false }
        return true
      })
      if (!baseChanges.length) return
      const store = useProjectStore.getState()
      const project = editControlBases(store.project, baseChanges)
      const history = commit(store.history, project, { now, key: key ?? burst?.key, mergeWindowMs: Infinity })
      if (history !== store.history) useProjectStore.setState({ project, history })
    },
  }
}
