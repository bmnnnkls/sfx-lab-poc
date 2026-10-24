import type { EngineCommand, EngineStatus } from '@core'

/** Name the worklet registers under; shared by both sides of the thread boundary. */
export const PROCESSOR_NAME = 'sfx-engine'

/** Main thread -> audio thread. */
export type HostMessage = { readonly kind: 'command'; readonly command: EngineCommand } | { readonly kind: 'prepare' }

/** Audio thread -> main thread. */
export type WorkletMessage =
  | { readonly kind: 'status'; readonly status: EngineStatus; readonly audioTime?: number }
  | { readonly kind: 'clock'; readonly clock: Pick<EngineStatus, 'tempo' | 'playing' | 'beat'>; readonly audioTime: number }
  | { readonly kind: 'ready' }
  | { readonly kind: 'preparation-error'; readonly message: string }
