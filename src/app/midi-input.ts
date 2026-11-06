import { type ClockPosition, EXPRESSION_REST, type ExpressionControl, type LiveNoteAddress, MIDI_MAX, type MidiFollow, PressureFold, controlTargetKey, expressionKey, expressionTarget, isExpressionCC, isRecordedExpression, liveNoteRouting, liveNoteTracks, parseMidiMessage } from '@core'
import { type EngineControls, type MidiService, isRecordableCC, isRecordingTrack, recordExpression, recordNote, recordPosition, recordPedal, useControlStore, useMidiStore, useProjectStore, useRecordSettings, useRecordStore, useSelectionStore } from '@state'
import { createMidiControls, nextFrame } from './midi-controls'

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
  const record = (trackId: string, kind: 'on' | 'off', portId: string, channel: number, pitch: number, velocity: number, at: ClockPosition | undefined) => {
    const when = { beat: at?.beat, ...(at && { lap: at.lap, run: at.run }) }
    recordNote(trackId, kind === 'on' ? { kind, source: sourceId(portId), channel, pitch, velocity, ...when } : { kind, source: sourceId(portId), channel, pitch, ...when })
  }
  const cc = createMidiControls()
  const sourceId = (id: string) => `midi:${id}`
  /** Per input and channel: polyphonic pressure folded into channel pressure. */
  const folds = new Map<string, PressureFold>()
  /** Per input and channel: the tracks its wheel, pressure and CCs went to, and which controls, to put back at rest. */
  const expressed = new Map<string, { readonly tracks: Set<string>; readonly controls: Map<string, ExpressionControl> }>()
  const portChannel = (portId: string, channel: number) => JSON.stringify([portId, channel])
  const fold = (portId: string, channel: number) => {
    const key = portChannel(portId, channel)
    let found = folds.get(key)
    if (!found) folds.set(key, found = new PressureFold())
    return found
  }
  /**
   * Over a lane playing that control (or one it already took over), the live value is an override, as a mapped knob's
   * is over a parameter's lane: the lane stays silent until *Read* or ■. The engine hears the value at once all the same;
   * the override, which only says who owns the control, is written once per frame with the latest value, as a mapped
   * CC's value is.
   */
  const overriding = new Map<string, { readonly target: ReturnType<typeof expressionTarget>; value: number; readonly recording: boolean }>()
  let overrideScheduled = false
  const flushOverrides = () => {
    overrideScheduled = false
    const pending = [...overriding.values()]
    overriding.clear()
    // One owned for a take that has ended since goes back to its lane, as the take's end said.
    for (const { target, value, recording } of pending) if (!recording || (target.owner.kind === 'track' && isRecordingTrack(target.owner.trackId))) useControlStore.getState().setOverride(target, value)
  }
  /** `recording`: a take is recording this control on the track, so live input owns it whether a lane plays it yet or not. */
  const overrideLane = (trackId: string, control: ExpressionControl, value: number, recording = false) => {
    const target = expressionTarget(trackId, control), key = controlTargetKey(target)
    const pending = overriding.get(key)
    if (pending) { pending.value = value; return }
    const state = useControlStore.getState()
    if (!recording && !state.playback.some((entry) => controlTargetKey(entry.target) === key) && !state.overrides.some((entry) => controlTargetKey(entry.target) === key)) return
    overriding.set(key, { target, value, recording })
    if (!overrideScheduled) { overrideScheduled = true; nextFrame(() => { if (overrideScheduled) flushOverrides() }) }
  }
  /** Whether ● keeps this control: the wheel, pressure, the mod wheel and the CCs ticked under *Recorded CCs*. */
  const recorded = (control: ExpressionControl) => isRecordedExpression(control, useRecordSettings.getState().recordedCCs)
  /**
   * The wheel, pressure or an unmapped CC goes where a note-on from that input and channel would, and to the recorder
   * when ● keeps it, with the message's time as notes are.
   */
  const express = (portId: string, channel: number, control: ExpressionControl, value: number, timestamp?: number) => {
    const key = portChannel(portId, channel)
    let entry = expressed.get(key)
    if (!entry) expressed.set(key, entry = { tracks: new Set(), controls: new Map() })
    entry.controls.set(expressionKey(control), control)
    const keep = recorded(control)
    const position = keep ? recordPosition(timestamp) : undefined
    const at = timestamp ?? performance.now()
    for (const trackId of liveNoteTracks(useProjectStore.getState().project, portId, channel, follow())) {
      entry.tracks.add(trackId)
      controls.expression(trackId, sourceId(portId), channel, control, value)
      const recording = keep && isRecordingTrack(trackId)
      overrideLane(trackId, control, value, recording)
      if (recording) recordExpression(trackId, { source: sourceId(portId), channel, control, value, at, beat: position?.beat, ...(position && { lap: position.lap, run: position.run }) })
    }
  }
  /** *Recorded CCs* → *Learn*: the next CC that can be ticked is, and learning stops. */
  const learnRecordedCC = (number: number) => {
    if (!useMidiStore.getState().learningRecordedCC || !isRecordableCC(number)) return
    useRecordSettings.getState().setRecordedCC(number, true)
    useMidiStore.setState({ learningRecordedCC: false })
  }
  const forgetExpression = (portId?: string, channel?: number) => {
    // Panic, disabling MIDI and a new document drop an override not yet written.
    if (portId === undefined) { overriding.clear(); overrideScheduled = false }
    for (const map of [folds, expressed]) {
      for (const key of map.keys()) {
        const [p, ch] = JSON.parse(key) as [string, number]
        if ((portId === undefined || p === portId) && (channel === undefined || ch === channel)) map.delete(key)
      }
    }
  }
  /** Releasing a source also puts its expression back at rest in the engine; here only the bookkeeping goes. */
  const release = (id: string, channel?: number) => {
    controls.releaseSource(sourceId(id), channel)
    cc.release(id, channel)
    forgetExpression(id, channel)
    for (const [key, presses] of keys) if (presses.some((press) => press.some((p) => p.note.sourceId === sourceId(id) && (channel === undefined || p.note.channel === channel)))) keys.delete(key)
  }
  const releaseAll = () => { for (const id of ports.keys()) release(id); cc.reset() }
  /**
   * After a routing change, releases each held note whose track no longer takes its press (the key-up would not find
   * it), and keeps the rest sounding: a pad held on a track's own input outlives a click on another track.
   */
  const reroute = () => {
    const project = useProjectStore.getState().project, now = follow(), beat = recordPosition()
    for (const [key, presses] of keys) {
      const [portId, channel, pitch] = JSON.parse(key) as [string, number, number]
      const taking = new Set(liveNoteTracks(project, portId, channel, now))
      const kept = presses
        .map((press) => press.filter(({ trackId, note }) => taking.has(trackId) || (controls.noteOff(trackId, note), record(trackId, 'off', portId, channel, pitch, 0, beat), false)))
        .filter((press) => press.length > 0)
      if (kept.length > 0) keys.set(key, kept)
      else keys.delete(key)
    }
    // A track that no longer hears an input's channel gets its wheel, pressure and CCs from there back at rest; one that
    // starts hearing it takes the next message.
    for (const [key, entry] of expressed) {
      const [portId, channel] = JSON.parse(key) as [string, number]
      const taking = new Set(liveNoteTracks(project, portId, channel, now))
      for (const trackId of entry.tracks) {
        if (taking.has(trackId)) continue
        entry.tracks.delete(trackId)
        for (const control of entry.controls.values()) {
          controls.expression(trackId, sourceId(portId), channel, control, EXPRESSION_REST)
          // A take there ends the span it had open on that control, holding its value: the rest isn't played.
          if (recorded(control)) recordExpression(trackId, { source: sourceId(portId), channel, control, value: EXPRESSION_REST, at: performance.now(), end: true, beat: beat?.beat, ...(beat && { lap: beat.lap, run: beat.run }) })
        }
      }
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
        recordPedal(sourceId(port.id), channel, message.value >= 64, recordPosition(timestamp))
      }
      // 120 to 127 are channel mode messages (all sound off, reset all controllers, all notes off…): each releases the
      // source and channel, which also puts its expression back at rest.
      else if (message.cc >= 120) release(port.id, channel)
      else if (!cc.receive(port.id, port.name ?? port.id, message, timestamp) && isExpressionCC(message.cc)) {
        learnRecordedCC(message.cc)
        express(port.id, channel, { cc: message.cc }, message.value / MIDI_MAX, timestamp)
      }
      return
    }
    if (message.kind === 'pitchBend') { express(port.id, channel, 'pitchBend', message.value, timestamp); return }
    if (message.kind === 'pressure') { express(port.id, channel, 'pressure', fold(port.id, channel).set(message.value), timestamp); return }
    if (message.kind === 'polyPressure') { express(port.id, channel, 'pressure', fold(port.id, channel).key(message.note, message.value), timestamp); return }
    const key = JSON.stringify([port.id, channel, message.note])
    if (message.kind === 'noteOn') {
      const trackIds = liveNoteTracks(useProjectStore.getState().project, port.id, channel, follow())
      if (trackIds.length === 0) return
      const press = ++serial
      // One note per track, each with its own id, so a layer releases as one press.
      const notes = trackIds.map((trackId, index) => ({ trackId, note: { sourceId: sourceId(port.id), channel, noteId: index === 0 ? `press:${press}` : `press:${press}:${index}` } }))
      keys.set(key, [...(keys.get(key) ?? []), notes])
      const beat = recordPosition(timestamp)
      for (const { trackId, note } of notes) {
        controls.noteOn(trackId, note, message.note, message.velocity)
        record(trackId, 'on', port.id, channel, message.note, message.velocity, beat)
      }
    } else {
      const presses = keys.get(key)
      const press = presses?.shift()
      if (!presses?.length) keys.delete(key)
      const beat = recordPosition(timestamp)
      for (const { trackId, note } of press ?? []) {
        controls.noteOff(trackId, note)
        record(trackId, 'off', port.id, channel, message.note, 0, beat)
      }
      // A key that comes up takes its polyphonic pressure with it.
      const folded = folds.get(portChannel(port.id, channel))?.keyUp(message.note)
      if (folded !== undefined) express(port.id, channel, 'pressure', folded, timestamp)
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
      access = undefined; keys.clear(); cc.reset(); forgetExpression()
      useMidiStore.getState().cancelLearn()
      useMidiStore.setState({ status: 'disabled', inputs: [] })
    },
    panic() { keys.clear(); forgetExpression(); cc.release(); cc.reset(); useMidiStore.getState().cancelLearn(); controls.panic() },
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
      if (next.documentEpoch !== prev.documentEpoch) { keys.clear(); forgetExpression(); cc.reset(); controls.panic(); useMidiStore.getState().cancelLearn(); useMidiStore.setState({ pinnedTrackId: null }); route = routing() }
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
