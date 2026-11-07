import { afterEach, expect, it, vi } from 'vitest'
import type { AudioHost } from '@audio'
import { useControlStore, usePersistenceStore, useStatusStore } from '@state'
import { connectEngine } from './project-sync'

let disconnect: (() => void) | undefined
afterEach(() => {
  disconnect?.()
  disconnect = undefined
  useControlStore.setState({ overrides: [], playback: [] })
  useStatusStore.setState({ status: null, audioFailure: null })
})

it('keeps startup failure visible in app state and unsubscribes on disconnect', () => {
  const failureListeners = new Set<(error: Error) => void>()
  const host = {
    send: vi.fn(),
    recordingPosition: () => undefined,
    onStatus: () => () => {},
    onFailure: (listener: (error: Error) => void) => {
      failureListeners.add(listener)
      return () => failureListeners.delete(listener)
    },
  } as unknown as AudioHost
  disconnect = connectEngine(host)

  for (const listener of failureListeners) listener(new Error('prepare failed'))
  expect(useStatusStore.getState().audioFailure).toBe('Audio failed to start—reload to retry')
  usePersistenceStore.getState().notify('error', 'Another error')
  expect(useStatusStore.getState().audioFailure).toBe('Audio failed to start—reload to retry')

  disconnect()
  disconnect = undefined
  useStatusStore.getState().setAudioFailure('')
  for (const listener of failureListeners) listener(new Error('late failure'))
  expect(useStatusStore.getState().audioFailure).toBe('')
})
