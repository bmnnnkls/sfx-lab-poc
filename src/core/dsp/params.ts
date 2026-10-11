import { clamp } from '../shared'
import type { ParamSpec } from './types'

/** Clamped parameter storage shared by node implementations. */
export class Params {
  readonly values: Record<string, number> = {}
  private readonly specs = new Map<string, ParamSpec>()

  constructor(specs: readonly ParamSpec[]) {
    for (const spec of specs) {
      this.specs.set(spec.id, spec)
      this.values[spec.id] = spec.default
    }
  }

  /** Returns false when the parameter is unknown. */
  set(id: string, value: number): boolean {
    const spec = this.specs.get(id)
    if (!spec) return false
    this.values[id] = clamp(value, spec.min, spec.max)
    return true
  }

  get(id: string): number {
    return this.values[id] ?? 0
  }
}
