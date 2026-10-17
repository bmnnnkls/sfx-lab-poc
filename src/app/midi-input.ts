import { type LiveNoteAddress, parseMidiMessage } from '@core'
import { type EngineControls, type MidiService, useMidiStore, useProjectStore, useSelectionStore } from '@state'
import { createMidiControls } from './midi-controls'

/** Only this adapter holds browser access/port objects. enable is called by a user action. */
export const createMidiInput = (controls: EngineControls, request: (() => Promise<MIDIAccess>) | undefined =
  typeof navigator !== 'undefined' && navigator.requestMIDIAccess ? () => navigator.requestMIDIAccess({ sysex: false }) : undefined, prepareAudio: () => void = () => {}) => {
  let access: MIDIAccess | undefined
  let generation = 0, serial = 0, enabled = false
  const ports = new Map<string, MIDIInput>()
  const closing = new Set<MIDIInput>()
  const keys = new Map<string, { trackId: string; note: LiveNoteAddress }[]>()
  const cc = createMidiControls()
  const sourceId = (id: string) => `midi:${id}`
  const release = (id: string, channel?: number) => {
    controls.releaseSource(sourceId(id), channel)
    cc.release(id, channel)
    for (const [key, presses] of keys) if (presses.some((p) => p.note.sourceId === sourceId(id) && (channel === undefined || p.note.channel === channel))) keys.delete(key)
  }
  const releaseAll = () => { for (const id of ports.keys()) release(id); cc.reset() }
  const destination = () => {
    const state = useMidiStore.getState()
    const id = state.pinnedTrackId ?? useSelectionStore.getState().trackId
    return useProjectStore.getState().project.tracks.find((track) => track.id === id && track.kind === 'instrument')?.id
  }
  const receive = (port: MIDIInput, data: ArrayLike<number>) => {
    const settings = useMidiStore.getState()
    if (!enabled || ports.get(port.id) !== port || port.state !== 'connected' || settings.disabledInputs.includes(port.id)) return
    const message = parseMidiMessage(data)
    if (!message) return
    const channel = message.channel - 1
    if (settings.channel !== null && channel !== settings.channel) return
    if (message.kind === 'cc') {
      if (message.cc === 64) controls.sustain(sourceId(port.id), channel, message.value >= 64)
      else if (message.cc >= 120) release(port.id, channel)
      else cc.receive(port.id, port.name ?? port.id, message)
      return
    }
    const key = JSON.stringify([port.id, channel, message.note])
    if (message.kind === 'noteOn') {
      const trackId = destination()
      if (!trackId) return
      const note = { sourceId: sourceId(port.id), channel, noteId: `press:${++serial}` }
      keys.set(key, [...(keys.get(key) ?? []), { trackId, note }])
      controls.noteOn(trackId, note, message.note, message.velocity)
    } else {
      const presses = keys.get(key)
      const press = presses?.shift()
      if (!presses?.length) keys.delete(key)
      if (press) controls.noteOff(press.trackId, press.note)
    }
  }
  const detach = (id: string, port: MIDIInput) => {
    release(id); port.onmidimessage = null; ports.delete(id)
    closing.add(port)
    void port.close().catch(() => {}).finally(() => { closing.delete(port); refresh() })
  }
  const refresh = () => {
    if (!enabled || !access) return
    for (const [id, port] of ports) if (access.inputs.get(id) !== port || port.state !== 'connected' || useMidiStore.getState().disabledInputs.includes(id)) detach(id, port)
    for (const port of access.inputs.values()) {
      if (port.state !== 'connected' || useMidiStore.getState().disabledInputs.includes(port.id) || ports.has(port.id) || closing.has(port)) continue
      ports.set(port.id, port)
      port.onmidimessage = (event) => { if (event.data) receive(port, event.data) }
    }
    useMidiStore.setState({ inputs: [...access.inputs.values()].map((port) => ({ id: port.id, name: port.name ?? port.id, connected: port.state === 'connected' })) })
  }
  const service: MidiService = {
    async enable() {
      if (enabled || useMidiStore.getState().status === 'requesting') return
      if (!request) { useMidiStore.setState({ status: 'unsupported', error: 'Web MIDI is unavailable in this browser. Use a supported browser over HTTPS or localhost.' }); return }
      prepareAudio()
      const epoch = ++generation
      useMidiStore.setState({ status: 'requesting', error: undefined })
      try {
        const result = await request()
        if (epoch !== generation) return
        access = result; enabled = true
        access.onstatechange = refresh
        useMidiStore.setState({ status: 'enabled' }); refresh()
      } catch (error) {
        if (epoch === generation) useMidiStore.setState({ status: 'denied', error: error instanceof Error ? error.message : 'MIDI access denied' })
      }
    },
    disable() {
      ++generation; enabled = false
      if (access) access.onstatechange = null
      for (const [id, port] of ports) detach(id, port)
      access = undefined; keys.clear(); cc.reset()
      useMidiStore.getState().cancelLearn()
      useMidiStore.setState({ status: 'disabled', inputs: [] })
    },
    panic() { keys.clear(); cc.release(); cc.reset(); useMidiStore.getState().cancelLearn(); controls.panic() },
  }
  const connect = () => {
    let route = destination()
    const selection = useSelectionStore.subscribe(() => { const next = destination(); if (route !== next) { releaseAll(); route = next } })
    const settings = useMidiStore.subscribe((next, prev) => {
      if (next.channel !== prev.channel || next.pinnedTrackId !== prev.pinnedTrackId) { releaseAll(); route = destination() }
      if (next.disabledInputs !== prev.disabledInputs) refresh()
    })
    const project = useProjectStore.subscribe((next, prev) => {
      if (next.documentEpoch !== prev.documentEpoch) { keys.clear(); cc.reset(); controls.panic(); useMidiStore.getState().cancelLearn(); useMidiStore.setState({ pinnedTrackId: null }); route = destination() }
      else {
        const pinned = useMidiStore.getState().pinnedTrackId
        if (pinned && !next.project.tracks.some((t) => t.id === pinned && t.kind === 'instrument')) useMidiStore.setState({ pinnedTrackId: null })
        if (route !== destination()) { releaseAll(); route = destination() }
      }
      if (next.project.midiMappings !== prev.project.midiMappings) cc.reconcile(next.project.midiMappings ?? [])
    })
    return () => { selection(); settings(); project(); service.disable() }
  }
  return { ...service, connect, releaseNotes: () => { releaseAll(); keys.clear() } }
}
