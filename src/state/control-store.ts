import { type ControlTarget, type ControlValue, type ControlResolution, clampControlValue, controlTargetKey, resolveControlTarget } from '@core'
import { create } from 'zustand'
import { useProjectStore } from './project-store'

interface ControlState {
  readonly overrides: readonly ControlValue[]
  setOverride(target: ControlTarget, value: number): ControlResolution
  release(target: ControlTarget): void
  clear(): void
}
/** Transient performance state: never part of the project/history/autosave subscription. */
export const useControlStore = create<ControlState>((set) => ({
  overrides: [],
  setOverride: (target, value) => {
    const resolved = resolveControlTarget(useProjectStore.getState().project, target)
    if (resolved.status !== 'available') return resolved
    if (!resolved.automatable || !Number.isFinite(value)) return { status: 'incompatible', reason: resolved.reason ?? 'Value must be finite' }
    const key = controlTargetKey(target)
    set((state) => ({ overrides: [...state.overrides.filter((entry) => controlTargetKey(entry.target) !== key), { target, value: clampControlValue(resolved.spec, value) }] }))
    return resolved
  },
  release: (target) => set((state) => ({ overrides: state.overrides.filter((entry) => controlTargetKey(entry.target) !== controlTargetKey(target)) })),
  clear: () => set({ overrides: [] }),
}))
