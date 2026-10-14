import { type MidiMessage, parseMidiMessage } from '@core'

export type MidiAccessResult = 'unsupported' | 'denied' | 'on'

/**
 * The browser's MIDI inputs as one stream of parsed messages, from every connected device (plugged in later too). Only
 * what the app uses comes through (notes and controllers); nothing is sent out.
 */
export class MidiInput {
  private access: MIDIAccess | null = null
  private readonly messageListeners = new Set<(message: MidiMessage) => void>()
  private readonly deviceListeners = new Set<(devices: readonly string[]) => void>()

  /** Asks for MIDI access (the browser may ask the user). Asking again once on is a no-op. */
  async enable(): Promise<MidiAccessResult> {
    if (this.access) return 'on'
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') return 'unsupported'
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
      return 'denied'
    }
    this.access.onstatechange = () => this.attach()
    this.attach()
    return 'on'
  }

  /** The names of the connected inputs. */
  devices(): readonly string[] {
    if (!this.access) return []
    return [...this.access.inputs.values()].filter((input) => input.state === 'connected').map((input) => input.name ?? 'MIDI input')
  }

  onMessage(listener: (message: MidiMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onDevices(listener: (devices: readonly string[]) => void): () => void {
    this.deviceListeners.add(listener)
    return () => this.deviceListeners.delete(listener)
  }

  /** (Re)listens to every input; called when access is granted and whenever a device comes or goes. */
  private attach(): void {
    if (!this.access) return
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event) => {
        const message = event.data ? parseMidiMessage(event.data) : undefined
        if (message) for (const listener of this.messageListeners) listener(message)
      }
    }
    const devices = this.devices()
    for (const listener of this.deviceListeners) listener(devices)
  }
}
