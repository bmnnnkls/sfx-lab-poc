import { MAX_AUTOMATION_POINTS, type AutomationSlot, type ControlOwner, automationOwnerKey, automationSlotsOf, type AudioClip, type AudioTrack, type AutomationLane, type AutomationPoint, type Clip, type ControlTarget, type ClipRef, type EngineStatus, type InstrumentTrack, automationPosition, canonicalAutomationPoints, controlFromNormalized, controlTargetKey, controlTargetLabel, controlToNormalized, enumerateControlTargets, resolveControlTarget } from '@core'
import { automationGestureKey, clipPhase, createClipboard, editOwnerAutomation, editRegionAutomation, useClipboard, useAutomationEditor, useControlStore, useProjectStore, useStatusStore, useTouchStore, finishTargetTouch } from '@state'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { formatParam } from '../shared/param-scale'
import styles from './AutomationEditor.module.css'
import { type PointGesture, copyPoints, dragPoints, pastePoints, pressPoints, removePoints, snapPointBeat } from './point-gestures'

/** Points copied in the editor, beats relative to the first; reactive, so Paste enables as soon as they're copied. */
const pointClipboard = createClipboard<readonly AutomationPoint[]>([])
const pointId = () => crypto.randomUUID()

/** The status entry that plays an owner's clips or automation slots. */
const launcherOf = (status: EngineStatus | null, owner: ControlOwner) => owner.kind === 'master' ? status?.masterAutomation : owner.kind === 'group' ? undefined : status?.tracks[owner.trackId]

/** The phase line of a playing clip, or a region the arrangement plays inside. Owns its status subscription so the editor doesn't re-render at 30 Hz. */
const AutomationPhase = ({ owner, clipId, lengthBeats, clipRef }: { owner: ControlOwner; clipId: string; lengthBeats: number; clipRef?: ClipRef }) => {
  const phase = useStatusStore((s) => {
    if (clipRef?.kind === 'region') {
      const beat = owner.kind === 'track' ? clipPhase(clipRef, owner.trackId, clipId, lengthBeats)(s.status) : null
      return beat === null ? undefined : beat / lengthBeats
    }
    const launcher = launcherOf(s.status, owner)
    return s.status && launcher?.playingClipId === clipId && launcher.startBeat !== null ? ((s.status.beat - launcher.startBeat) % lengthBeats) / lengthBeats : undefined
  })
  return phase === undefined ? null : <line x1={phase * 1000} x2={phase * 1000} y1={0} y2={100} className={styles.playhead} />
}

/** `clipRef`: a region's own copy (its lanes edited there, never its session source's); absent, a session clip or a slot. */
export const AutomationEditor = ({ track, clip, owner: explicitOwner, clipRef }: { track: Pick<InstrumentTrack | AudioTrack, 'id' | 'name'>; clip: Clip | AudioClip | AutomationSlot; owner?: ControlOwner; clipRef?: ClipRef }) => {
  const owner: ControlOwner = explicitOwner ?? { kind: 'track', trackId: track.id }
  const owns = (target: ControlTarget) => automationOwnerKey(target.owner) === automationOwnerKey(owner)
  const touch = useTouchStore()
  const project = useProjectStore((s) => s.project)
  const targetName = (target: ControlTarget) => controlTargetLabel(project, target)
  const requested = useAutomationEditor((s) => s.target)
  const overrides = useControlStore((s) => s.overrides)
  const region = clipRef?.kind === 'region' ? clipRef.regionId : null
  const launched = useStatusStore((s) => region === null && launcherOf(s.status, owner)?.playingClipId === clip.id)
  const lanes = clip.automation ?? []
  const [laneId, setLaneId] = useState(lanes[0]?.id)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [search, setSearch] = useState('')
  const [step, setStep] = useState(0.25)
  const [zoom, setZoom] = useState(1)
  const [pasteBeat, setPasteBeat] = useState(0)
  const drag = useRef<{ key: string; gesture: PointGesture } | null>(null)
  const [box, setBox] = useState<{ from: { beat: number; value: number }; to: { beat: number; value: number } } | null>(null)
  const lane = lanes.find((lane) => lane.id === laneId) ?? lanes[0]
  const resolveLane = (target: ControlTarget) => owns(target) ? resolveControlTarget(project, target) : { status: 'unavailable' as const, automatable: false, reason: 'Unsupported automation owner; lane retained but will not play' }
  const resolution = lane && resolveLane(lane.target)
  const available = resolution?.status === 'available' ? resolution : undefined
  const edit = (next: readonly AutomationLane[], key?: string) => (region !== null ? editRegionAutomation(region, next, key) : editOwnerAutomation(owner, clip.id, next, key))
  const change = (points: readonly AutomationPoint[], key?: string) => lane && edit(lanes.map((l) => l.id === lane.id ? { ...l, points: canonicalAutomationPoints(points, clip.lengthBeats) } : l), key)
  const addLane = (target: ControlTarget) => {
    const existing = lanes.find((l) => controlTargetKey(l.target) === controlTargetKey(target))
    if (existing) { setLaneId(existing.id); return }
    const next: AutomationLane = { id: pointId(), target, enabled: true, points: [] }
    edit([...lanes, next]); setLaneId(next.id); setSelected(new Set())
  }
  useEffect(() => {
    // *Show automation in clip* asks for a session clip's or a slot's lane; a region's editor leaves the request alone.
    if (requested && owns(requested) && region === null) {
      const current = useProjectStore.getState().project.tracks.find((t) => t.id === track.id)
      const currentClip = (automationSlotsOf(useProjectStore.getState().project, owner) ?? (current && current.kind !== 'return' ? current.clips : [])).find((c) => c?.id === clip.id)
      const existing = currentClip?.automation?.find((l) => controlTargetKey(l.target) === controlTargetKey(requested))
      if (existing) setLaneId(existing.id)
      else {
        const newLane: AutomationLane = { id: pointId(), target: requested, enabled: true, points: [] }
        editOwnerAutomation(owner, clip.id, [...(currentClip?.automation ?? []), newLane]); setLaneId(newLane.id)
      }
      useAutomationEditor.setState({ target: undefined })
    }
  }, [requested, track.id, clip.id])
  const copied = useClipboard(pointClipboard)
  const grid = { step, length: clip.lengthBeats }
  const copy = () => { if (lane) { const points = copyPoints(lane.points, selected); if (points.length) pointClipboard.set(points) } }
  const remove = () => { if (!selected.size) return; if (lane) change(removePoints(lane.points, selected)); setSelected(new Set()) }
  const paste = (beat = pasteBeat) => {
    if (!lane) return
    const { points, pasted } = pastePoints(lane.points, pointClipboard.get(), beat, clip.lengthBeats, pointId)
    change(points); setSelected(pasted)
  }
  /** The pointer in the clip's beats (not snapped) and the lane's value. */
  const coords = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { beat: Math.max(0, Math.min(clip.lengthBeats, (event.clientX - rect.left) / rect.width * clip.lengthBeats)), value: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) }
  }
  const keysOf = (event: PointerEvent) => ({ shift: event.shiftKey, command: event.metaKey || event.ctrlKey, alt: event.altKey })
  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (!lane || event.button !== 0) return
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
    const at = coords(event)
    setPasteBeat(snapPointBeat(at.beat, grid, keysOf(event)))
    const result = pressPoints(lane.points, (event.target as Element).getAttribute('data-point-id'), at, keysOf(event), selected, grid, pointId)
    const key = automationGestureKey()
    setSelected(result.selected)
    drag.current = result.gesture && { key, gesture: result.gesture }
    if (result.gesture?.kind === 'box') setBox({ from: at, to: at })
    if (result.changed) change(result.points, key)
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current
    if (!active) return
    const at = coords(event)
    const result = dragPoints(active.gesture, at, keysOf(event), grid)
    if (active.gesture.kind === 'box') { setBox({ from: active.gesture.from, to: at }); setSelected(result.selected) }
    else if (result.points) change(result.points, active.key)
  }
  const end = () => { drag.current = null; setBox(null) }
  const points = lane?.points ?? []
  const path = points.length ? `M 0 ${100 - points[0]!.value * 100} ` + points.map((p, i) => {
    const prev = points[i - 1]
    return `${prev && (prev.interpolation === 'hold' || available?.interpolation === 'hold') ? `L ${p.beat / clip.lengthBeats * 1000} ${100 - prev.value * 100} ` : ''}L ${p.beat / clip.lengthBeats * 1000} ${100 - p.value * 100}`
  }).join(' ') + ` L 1000 ${100 - points.at(-1)!.value * 100}` : ''
  const only = selected.size === 1 ? points.find((p) => selected.has(p.id)) : undefined
  const targets = enumerateControlTargets(project).filter((t) => owns(t) && targetName(t).toLowerCase().includes(search.toLowerCase()))
  const overridden = lane && overrides.some((entry) => controlTargetKey(entry.target) === controlTargetKey(lane.target))
  return <section className={styles.editor} aria-label="Automation editor" data-automation-editor>
    <header className={styles.toolbar}><strong>{track.name} / {clip.name} · {touch.armed ? 'Touch armed' : 'Read'}</strong><button onClick={() => overrides.filter((entry) => owns(entry.target)).forEach((entry) => { finishTargetTouch(entry.target); useControlStore.getState().release(entry.target) })}>Re-enable automation</button><label>Grid <select aria-label="Automation grid" value={step} onChange={(e) => setStep(Number(e.target.value))}>{[0, 0.125, 0.25, 0.5, 1].map((n) => <option key={n} value={n}>{n || 'Off'}</option>)}</select></label><label>Zoom <input aria-label="Automation zoom" type="range" min={1} max={8} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label></header>
    {touch.armed && !launched && <output>{region !== null ? 'Touch doesn\u2019t record into a region\u2019s own lanes' : 'Touch unavailable here: launch this clip or automation slot'}</output>}
    <div className={styles.body}><aside className={styles.lanes}><input aria-label="Search automation targets" placeholder="Search targets…" value={search} onChange={(e) => setSearch(e.target.value)} />{lanes.length > 0 && <select className={styles.lanePicker} aria-label="Automation lane" value={lane?.id ?? ''} onChange={(e) => { setLaneId(e.target.value); setSelected(new Set()) }}>{lanes.map((l) => <option key={l.id} value={l.id}>{targetName(l.target)}</option>)}</select>}<select aria-label="Add automation lane" value="" disabled={lanes.length >= 64} onChange={(e) => { const target = targets.find((t) => controlTargetKey(t) === e.target.value); if (target) addLane(target) }}><option value="">Add target…</option>{targets.map((target) => { const r = resolveControlTarget(project, target); return <option key={controlTargetKey(target)} value={controlTargetKey(target)} disabled={r.status !== 'available' || !r.automatable}>{targetName(target)}{r.status !== 'available' || !r.automatable ? ' (unavailable)' : ''}</option> })}</select>
      {lanes.map((l) => { const r = resolveLane(l.target); const missing = r.status !== 'available' || !r.automatable; return <div key={l.id} className={styles.lane}><input type="checkbox" aria-label={`Enable ${targetName(l.target)}`} checked={l.enabled} onChange={(e) => edit(lanes.map((v) => v.id === l.id ? { ...v, enabled: e.target.checked } : v))} /><button aria-pressed={lane?.id === l.id} onClick={() => { setLaneId(l.id); setSelected(new Set()) }} title={missing ? r.reason : targetName(l.target)}>{missing ? '⚠ Unavailable: ' : ''}{targetName(l.target)}</button><button aria-label="Delete automation lane" onClick={() => edit(lanes.filter((v) => v.id !== l.id))}>×</button></div> })}</aside>
      <div className={styles.main}>{lane ? <><div className={styles.toolbar}><span>{touch.recording.includes(controlTargetKey(lane.target)) ? 'Touch recording' : overridden ? 'Override' : lane.enabled ? 'Read' : 'Disabled'}{resolution && (resolution.status !== 'available' || !resolution.automatable) ? ` · ${resolution.reason}` : ''}</span><button disabled={!selected.size} onClick={copy}>Copy</button><button disabled={!selected.size} onClick={() => { copy(); remove() }}>Cut</button><button disabled={!copied.length} onClick={() => paste()}>Paste</button><button disabled={!selected.size} onClick={() => { copy(); paste(Math.min(clip.lengthBeats, Math.max(...points.filter((p) => selected.has(p.id)).map((p) => p.beat)) + (step || 0.25))) }}>Duplicate</button><button disabled={!selected.size} onClick={remove}>Delete points</button><button onClick={() => change([])}>Clear lane</button><label>Paste at <input aria-label="Paste beat" type="number" min={0} max={clip.lengthBeats} step={step || 'any'} value={pasteBeat} onChange={(e) => setPasteBeat(Number(e.target.value))} /></label></div>
      <div className={styles.scroll} data-scroll="x"><div style={{ width: `${zoom * 100}%` }}><div className={styles.ruler}>{Array.from({ length: Math.ceil(clip.lengthBeats) + 1 }, (_, i) => <span key={i} style={{ left: `${i / clip.lengthBeats * 100}%` }}>{i}</span>)}</div><svg className={styles.canvas} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-label="Automation drawing area" role="application" tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={(e) => {
        const cmd = e.metaKey || e.ctrlKey
        if (cmd && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(points.map((p) => p.id))) }
        if (cmd && e.key.toLowerCase() === 'c') { e.preventDefault(); copy() }
        if (cmd && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(); remove() }
        if (cmd && e.key.toLowerCase() === 'v') { e.preventDefault(); paste() }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
      }}>
        {Array.from({ length: Math.min(1024, Math.ceil(clip.lengthBeats / (step || 1))) }, (_, i) => <line key={i} x1={i * (step || 1) / clip.lengthBeats * 1000} x2={i * (step || 1) / clip.lengthBeats * 1000} y1={0} y2={100} className={styles.grid} />)}
        <path d={path} className={styles.curve} />{box && <rect data-testid="automation-box" className={styles.box} x={Math.min(box.from.beat, box.to.beat) / clip.lengthBeats * 1000} width={Math.abs(box.to.beat - box.from.beat) / clip.lengthBeats * 1000} y={100 - Math.max(box.from.value, box.to.value) * 100} height={Math.abs(box.to.value - box.from.value) * 100} />}{points.map((p) => <ellipse key={p.id} data-point-id={p.id} cx={p.beat / clip.lengthBeats * 1000} cy={100 - p.value * 100} rx={6 / zoom} ry={2.3} className={selected.has(p.id) ? styles.selected : styles.point}><title>{p.beat} beats · {available ? formatParam(available.spec, controlFromNormalized(available.spec, p.value)) : p.value}</title></ellipse>)}<AutomationPhase owner={owner} clipId={clip.id} lengthBeats={clip.lengthBeats} clipRef={clipRef} />
      </svg></div></div>
      {only && <div className={styles.toolbar}><label>Beat <input key={`beat:${only.id}:${only.beat}`} aria-label="Point beat" type="number" defaultValue={only.beat} min={0} max={clip.lengthBeats} step={step || 'any'} onBlur={(e) => change(points.map((p) => p.id === only.id ? { ...p, beat: Number(e.target.value) } : p))} /></label><label>Value {available?.spec.unit ?? ''}<input key={`value:${only.id}:${only.value}`} aria-label="Point value" type="number" step="any" defaultValue={available ? controlFromNormalized(available.spec, only.value) : only.value} onBlur={(e) => change(points.map((p) => p.id === only.id ? { ...p, value: available ? controlToNormalized(available.spec, Number(e.target.value)) : Number(e.target.value) } : p))} /></label><label>Segment <select aria-label="Point interpolation" value={only.interpolation} onChange={(e) => change(points.map((p) => p.id === only.id ? { ...p, interpolation: e.target.value as 'linear' | 'hold' } : p))}><option value="linear">Linear</option><option value="hold">Hold</option></select></label></div>}
      <p className={styles.hint}>{points.length} / {MAX_AUTOMATION_POINTS} points · Click to draw · drag selected points · Shift-click to select · ⌘/Ctrl A/C/X/V · Delete · times are beats, values follow the control scale{available && points.length ? ` · first: ${formatParam(available.spec, controlFromNormalized(available.spec, automationPosition(lane, 0)!))}` : ''}</p></> : <p className={styles.hint}>Add a target to draw automation. Empty lanes leave base values unchanged.</p>}</div>
    </div>
  </section>
}
