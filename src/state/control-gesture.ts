import { type ControlValue, controlTargetKey, commit, editControlBases } from '@core'
import { useControlStore } from './control-store'
import { useProjectStore } from './project-store'
let serial = 0
/** Explicit gesture lifetime: long drags merge; consecutive drags cannot merge by timing accident. */
export const createControlGesture = () => {
  let key: string | undefined
  let burst: { signature: string; key: string; at: number } | undefined
  return {
    begin() { key ??= `control-gesture:${++serial}`; burst = undefined },
    end() { key = undefined; burst = undefined },
    change(changes: readonly ControlValue[]) {
      const now = Date.now()
      // Wheel input has no native begin/end; merge only a short burst on the same controls.
      if (key === undefined) {
        const signature = changes.map((change) => controlTargetKey(change.target)).join('|')
        burst = burst?.signature === signature && now - burst.at <= 800
          ? { ...burst, at: now } : { signature, key: `control-burst:${++serial}`, at: now }
      }
      const store = useProjectStore.getState()
      const controls = useControlStore.getState()
      const baseChanges = changes.filter((change) => {
        const key = controlTargetKey(change.target)
        const automated = controls.playback.some((entry) => controlTargetKey(entry.target) === key)
        const overridden = controls.overrides.some((entry) => controlTargetKey(entry.target) === key)
        if (automated || overridden) { controls.setOverride(change.target, change.value); return false }
        return true
      })
      if (!baseChanges.length) return
      const project = editControlBases(store.project, baseChanges)
      const history = commit(store.history, project, { now, key: key ?? burst?.key, mergeWindowMs: Infinity })
      if (history !== store.history) useProjectStore.setState({ project, history })
    },
  }
}
