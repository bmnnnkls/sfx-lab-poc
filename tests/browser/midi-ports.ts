import type { Page } from '@playwright/test'
declare global {
  interface Window {
    __midiTest: { requests: number; send(bytes: number[], id?: string): void; connected(id: string, connected: boolean): void }
  }
}
/** Simulate only the browser device boundary; application parser, stores and worklet are real. */
export const installMidiPorts = (page: Page, mode: 'granted' | 'denied' | 'unsupported' = 'granted') => page.addInitScript((mode) => {
  const ports = new Map<string, MIDIInput>()
  for (const id of ['keys', 'other']) ports.set(id, { id, name: id === 'keys' ? 'Test keyboard' : 'Other controller', state: 'connected', onmidimessage: null, close: async () => {} } as unknown as MIDIInput)
  const access = { inputs: ports, onstatechange: null } as unknown as MIDIAccess
  window.__midiTest = {
    requests: 0,
    send(bytes, id = 'keys') { const p = ports.get(id)!; p.onmidimessage?.call(p, { data: new Uint8Array(bytes) } as MIDIMessageEvent) },
    connected(id, connected) { Object.assign(ports.get(id)!, { state: connected ? 'connected' : 'disconnected' }); access.onstatechange?.call(access, {} as MIDIConnectionEvent) },
  }
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: mode === 'unsupported' ? undefined : async (options: MIDIOptions) => {
    window.__midiTest.requests++
    if (options.sysex) throw new Error('SysEx must remain disabled')
    if (mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError')
    return access
  } })
}, mode)
export const sendMidi = (page: Page, bytes: number[], id = 'keys') => page.evaluate(({ bytes, id }) => window.__midiTest.send(bytes, id), { bytes, id })
