import { type LiveNoteAddress, type MidiFollow, liveNoteRouting, liveNoteTracks, parseMidiMessage } from '@core'
import { type EngineControls, type MidiService, recordBeat, recordNote, recordPedal, useMidiStore, useProjectStore, useRecordStore, useSelectionStore } from '@state'
import { createMidiControls } from './midi-controls'

/** Only this adapter holds browser access/port objects. enable is called by a user action. */
export const createMidiInput = (controls: EngineControls, request: (() => Promise<MIDIAccess>) | undefined =
  typeof navigator !== 'undefined' && navigator.requestMIDIAccess ? () => navigator.requestMIDIAccess({ sysex: false }) : undefined, prepareAudio: () => void = () => {}) => {
  let access: MIDIAccess | undefined
  let generation = 0, serial = 0, enabled = false
  const ports = new Map<string, MIDIInput>()
  const closing = new Set<MIDIInput>()
  /** Per input, channel and pitch: each held press, with the notes it started (one per track it went to). */
  const keys = new Map<string, { trackId: string; note: LiveNoteAddress }[][]>()
  /** Each note goes to the recorder too, which keeps it when the track has a take. */
  const record = (trackId: string, kind: 'on' | 'off', portId: string, channel: number, pitch: number, velocity: number, beat: number | undefined) =>
    recordNote(trackId, kind === 'on' ? { kind, source: sourceId(portId), channel, pitch, velocity, beat } : { kind, source: sourceId(portId), channel, pitch, beat })
  const cc = createMidiControls()
  const sourceId = (id: string) => `midi:${id}`
  const release = (id: string, channel?: number) => {
    controls.releaseSource(sourceId(id), channel)
    cc.release(id, channel)
    for (const [key, presses] of keys) if (presses.some((press) => press.some((p) => p.note.sourceId === sourceId(id) && (channel === undefined || p.note.channel === channel)))) keys.delete(key)
  }
  const releaseAll = () => { for (const id of ports.keys()) release(id); cc.reset() }
  /**
   * After a routing change, releases each held note whose track no longer takes its press (the key-up would not find
   * it), and keeps the rest sounding: a pad held on a track's own input outlives a click on another track.
   */
  const reroute = () => {
    const project = useProjectStore.getState().project, now = follow(), beat = recordBeat()
    for (const [key, presses] of keys) {
      const [portId, channel, pitch] = JSON.parse(key) as [string, number, number]
      const taking = new Set(liveNoteTracks(project, portId, channel, now))
      const kept = presses
        .map((press) => press.filter(({ trackId, note }) => taking.has(trackId) || (controls.noteOff(trackId, note), record(trackId, 'off', portId, channel, pitch, 0, beat), false)))
        .filter((press) => press.length > 0)
      if (kept.length > 0) keys.set(key, kept)
      else keys.delete(key)
    }
  }
  /**
   * The track that follows the selection: the pinned instrument, else the selected one; the channel it listens to; and
   * the armed tracks, which hear the keyboard too.
   */
  const follow = (): MidiFollow => {
    const state = useMidiStore.getState()
    return { trackId: state.pinnedTrackId ?? useSelectionStore.getState().trackId, channel: state.channel, armed: useRecordStore.getState().armed }
  }
  /** Changes whenever where a note would go may change; held notes are released then. */
  const routing = () => liveNoteRouting(useProjectStore.getState().project, follow())
  const receive = (port: MIDIInput, data: ArrayLike<number>, timestamp?: number) => {
    const settings = useMidiStore.getState()
    if (!enabled || ports.get(port.id) !== port || port.state !== 'connected' || settings.disabledInputs.includes(port.id)) return
    const message = parseMidiMessage(data)
    if (!message) return
    const channel = message.channel - 1
    // The channel setting is the followed track's: notes on other channels may still be for a track's own input, and a
    // mapped CC names its channel itself.
    if (message.kind === 'cc') {
      if (message.cc === 64) {
        controls.sustain(sourceId(port.id), channel, message.value >= 64)
        recordPedal(sourceId(port.id), channel, message.value >= 64, recordBeat(timestamp))
      }
      else if (message.cc >= 120) release(port.id, channel)
      else cc.receive(port.id, port.name ?? port.id, message, timestamp)
      return
    }
    const key = JSON.stringify([port.id, channel, message.note])
    if (message.kind === 'noteOn') {
      const trackIds = liveNoteTracks(useProjectStore.getState().project, port.id, channel, follow())
      if (trackIds.length === 0) return
      const press = ++serial
      // One note per track, each with its own id, so a layer releases as one press.
      const notes = trackIds.map((trackId, index) => ({ trackId, note: { sourceId: sourceId(port.id), channel, noteId: index === 0 ? `press:${press}` : `press:${press}:${index}` } }))
      keys.set(key, [...(keys.get(key) ?? []), notes])
      const beat = recordBeat(timestamp)
      for (const { trackId, note } of notes) {
        controls.noteOn(trackId, note, message.note, message.velocity)
        record(trackId, 'on', port.id, channel, message.note, message.velocity, beat)
      }
    } else {
      const presses = keys.get(key)
      const press = presses?.shift()
      if (!presses?.length) keys.delete(key)
      const beat = recordBeat(timestamp)
      for (const { trackId, note } of press ?? []) {
        controls.noteOff(trackId, note)
        record(trackId, 'off', port.id, channel, message.note, 0, beat)
      }
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
      port.onmidimessage = (event) => { if (event.data) receive(port, event.data, event.timeStamp) }
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
    let route = routing()
    const changed = () => { const next = routing(); if (route !== next) { reroute(); route = next } }
    const selection = useSelectionStore.subscribe(changed)
    const arming = useRecordStore.subscribe((next, prev) => { if (next.armed !== prev.armed) changed() })
    const settings = useMidiStore.subscribe((next, prev) => {
      if (next.channel !== prev.channel || next.pinnedTrackId !== prev.pinnedTrackId) changed()
      if (next.disabledInputs !== prev.disabledInputs) refresh()
    })
    const project = useProjectStore.subscribe((next, prev) => {
      if (next.documentEpoch !== prev.documentEpoch) { keys.clear(); cc.reset(); controls.panic(); useMidiStore.getState().cancelLearn(); useMidiStore.setState({ pinnedTrackId: null }); route = routing() }
      else {
        const pinned = useMidiStore.getState().pinnedTrackId
        if (pinned && !next.project.tracks.some((t) => t.id === pinned && t.kind === 'instrument')) useMidiStore.setState({ pinnedTrackId: null })
        changed()
      }
      if (next.project.midiMappings !== prev.project.midiMappings) cc.reconcile(next.project.midiMappings ?? [])
    })
    return () => { selection(); arming(); settings(); project(); service.disable() }
  }
  return { ...service, connect, releaseNotes: () => { releaseAll(); keys.clear() } }
}
