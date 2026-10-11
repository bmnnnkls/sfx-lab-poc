import type { EngineCommand, EngineStatus } from '@core'

/** Name the worklet registers under; shared by both sides of the thread boundary. */
export const PROCESSOR_NAME = 'sfx-engine'

/** Main thread -> audio thread. */
export type HostMessage = { readonly kind: 'command'; readonly command: EngineCommand }

/** Audio thread -> main thread. */
export type WorkletMessage = { readonly kind: 'status'; readonly status: EngineStatus }
