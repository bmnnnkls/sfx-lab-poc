import { MAX_AUTOMATION_POINTS, type AutomationSlot, type ControlOwner, automationOwnerKey, automationSlotsOf, type AudioClip, type AudioTrack, type AutomationLane, type AutomationPoint, type Clip, type ControlTarget, type InstrumentTrack, automationPosition, canonicalAutomationPoints, controlFromNormalized, controlTargetKey, controlTargetLabel, controlToNormalized, enumerateControlTargets, resolveControlTarget } from '@core'
import { automationGestureKey, editOwnerAutomation, useAutomationEditor, useControlStore, useProjectStore, useStatusStore } from '@state'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { formatParam } from '../shared/param-scale'
import styles from './AutomationEditor.module.css'

let clipboard: readonly AutomationPoint[] = []
const pointId = () => crypto.randomUUID()


export const AutomationEditor = ({ track, clip, owner: explicitOwner }: { track: Pick<InstrumentTrack | AudioTrack, 'id' | 'name'>; clip: Clip | AudioClip | AutomationSlot; owner?: ControlOwner }) => {
  const owner: ControlOwner = explicitOwner ?? { kind: 'track', trackId: track.id }
  const owns = (target: ControlTarget) => automationOwnerKey(target.owner) === automationOwnerKey(owner)
  const project = useProjectStore((s) => s.project)
  const targetName = (target: ControlTarget) => controlTargetLabel(project, target)
  const requested = useAutomationEditor((s) => s.target)
  const overrides = useControlStore((s) => s.overrides)
  const status = useStatusStore((s) => s.status)
  const lanes = clip.automation ?? []
  const [laneId, setLaneId] = useState(lanes[0]?.id)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [search, setSearch] = useState('')
  const [step, setStep] = useState(0.25)
  const [zoom, setZoom] = useState(1)
  const [pasteBeat, setPasteBeat] = useState(0)
  const drag = useRef<{ key: string; origin: readonly AutomationPoint[]; selected: ReadonlySet<string>; beat: number; value: number } | null>(null)
  const lane = lanes.find((lane) => lane.id === laneId) ?? lanes[0]
  const resolution = lane && resolveControlTarget(project, lane.target)
  const available = resolution?.status === 'available' ? resolution : undefined
  const edit = (next: readonly AutomationLane[], key?: string) => editOwnerAutomation(owner, clip.id, next, key)
  const change = (points: readonly AutomationPoint[], key?: string) => lane && edit(lanes.map((l) => l.id === lane.id ? { ...l, points: canonicalAutomationPoints(points, clip.lengthBeats) } : l), key)
  const addLane = (target: ControlTarget) => {
    const existing = lanes.find((l) => controlTargetKey(l.target) === controlTargetKey(target))
    if (existing) { setLaneId(existing.id); return }
    const next: AutomationLane = { id: pointId(), target, enabled: true, points: [] }
    edit([...lanes, next]); setLaneId(next.id); setSelected(new Set())
  }
  useEffect(() => {
    if (requested && owns(requested)) {
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
  const copy = () => { if (lane) { const points = lane.points.filter((p) => selected.has(p.id)); const start = Math.min(...points.map((p) => p.beat)); clipboard = points.map((p) => ({ ...p, beat: p.beat - start })) } }
  const remove = () => { if (lane) change(lane.points.filter((p) => !selected.has(p.id))); setSelected(new Set()) }
  const paste = (beat = pasteBeat) => {
    if (!lane) return
    const points = clipboard.map((p) => ({ ...p, id: pointId(), beat: p.beat + beat }))
    change([...lane.points, ...points]); setSelected(new Set(points.map((p) => p.id)))
  }
  const coords = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = Math.max(0, Math.min(clip.lengthBeats, (event.clientX - rect.left) / rect.width * clip.lengthBeats))
    return { beat: step ? Math.round(raw / step) * step : raw, value: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) }
  }
  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (!lane || event.button !== 0) return
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
    const { beat, value } = coords(event)
    setPasteBeat(beat)
    const id = (event.target as Element).getAttribute('data-point-id')
    const existing = lane.points.find((p) => p.id === id)
    if (!existing && lane.points.length >= MAX_AUTOMATION_POINTS) return
    if (event.shiftKey && existing) { const next = new Set(selected); if (next.has(existing.id)) next.delete(existing.id); else next.add(existing.id); setSelected(next); return }
    const point: AutomationPoint = existing ?? { id: pointId(), beat, value, interpolation: 'linear' }
    const ids = existing && selected.has(existing.id) ? selected : new Set([point.id])
    const points = existing ? lane.points : [...lane.points, point]
    const key = automationGestureKey()
    setSelected(ids)
    drag.current = { key, origin: points, selected: ids, beat, value }
    if (!existing) change(points, key)
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current
    if (!active) return
    const { beat, value } = coords(event)
    const chosen = active.origin.filter((p) => active.selected.has(p.id))
    const delta = Math.max(-Math.min(...chosen.map((p) => p.beat)), Math.min(clip.lengthBeats - Math.max(...chosen.map((p) => p.beat)), beat - active.beat))
    change(active.origin.map((p) => active.selected.has(p.id) ? { ...p, beat: p.beat + delta, value: Math.max(0, Math.min(1, p.value + value - active.value)) } : p), active.key)
  }
  const points = lane?.points ?? []
  const path = points.length ? `M 0 ${100 - points[0]!.value * 100} ` + points.map((p, i) => {
    const prev = points[i - 1]
    return `${prev && (prev.interpolation === 'hold' || available?.interpolation === 'hold') ? `L ${p.beat / clip.lengthBeats * 1000} ${100 - prev.value * 100} ` : ''}L ${p.beat / clip.lengthBeats * 1000} ${100 - p.value * 100}`
  }).join(' ') + ` L 1000 ${100 - points.at(-1)!.value * 100}` : ''
  const only = selected.size === 1 ? points.find((p) => selected.has(p.id)) : undefined
  const playing = owner.kind === 'master' ? status?.masterAutomation : status?.tracks[owner.trackId]
  const phase = playing?.playingClipId === clip.id && playing.startBeat !== null ? ((status!.beat - playing.startBeat) % clip.lengthBeats) / clip.lengthBeats : undefined
  const targets = enumerateControlTargets(project).filter((t) => owns(t) && targetName(t).toLowerCase().includes(search.toLowerCase()))
  const overridden = lane && overrides.some((entry) => controlTargetKey(entry.target) === controlTargetKey(lane.target))
  return <section className={styles.editor} aria-label="Automation editor" data-automation-editor>
    <header className={styles.toolbar}><strong>{track.name} / {clip.name} · Read</strong><button onClick={() => overrides.filter((entry) => owns(entry.target)).forEach((entry) => useControlStore.getState().release(entry.target))}>Re-enable automation</button><label>Grid <select aria-label="Automation grid" value={step} onChange={(e) => setStep(Number(e.target.value))}>{[0, 0.125, 0.25, 0.5, 1].map((n) => <option key={n} value={n}>{n || 'Off'}</option>)}</select></label><label>Zoom <input aria-label="Automation zoom" type="range" min={1} max={8} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label></header>
    <div className={styles.body}><aside className={styles.lanes}><input aria-label="Search automation targets" placeholder="Search targets…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Add automation lane" value="" disabled={lanes.length >= 64} onChange={(e) => { const target = targets.find((t) => controlTargetKey(t) === e.target.value); if (target) addLane(target) }}><option value="">Add target…</option>{targets.map((target) => { const r = resolveControlTarget(project, target); return <option key={controlTargetKey(target)} value={controlTargetKey(target)} disabled={r.status !== 'available' || !r.automatable}>{targetName(target)}{r.status !== 'available' || !r.automatable ? ' (unavailable)' : ''}</option> })}</select>
      {lanes.map((l) => { const r = resolveControlTarget(project, l.target); const missing = r.status !== 'available' || !r.automatable; return <div key={l.id} className={styles.lane}><input type="checkbox" aria-label={`Enable ${targetName(l.target)}`} checked={l.enabled} onChange={(e) => edit(lanes.map((v) => v.id === l.id ? { ...v, enabled: e.target.checked } : v))} /><button aria-pressed={lane?.id === l.id} onClick={() => { setLaneId(l.id); setSelected(new Set()) }} title={missing ? r.reason : targetName(l.target)}>{missing ? '⚠ Unavailable: ' : ''}{targetName(l.target)}</button><button aria-label="Delete automation lane" onClick={() => edit(lanes.filter((v) => v.id !== l.id))}>×</button></div> })}</aside>
      <div className={styles.main}>{lane ? <><div className={styles.toolbar}><span>{overridden ? 'Override' : lane.enabled ? 'Read' : 'Disabled'}{resolution && (resolution.status !== 'available' || !resolution.automatable) ? ` · ${resolution.reason}` : ''}</span><button disabled={!selected.size} onClick={copy}>Copy</button><button disabled={!selected.size} onClick={() => { copy(); remove() }}>Cut</button><button onClick={() => paste()}>Paste</button><button disabled={!selected.size} onClick={() => { copy(); paste(Math.min(clip.lengthBeats, Math.max(...points.filter((p) => selected.has(p.id)).map((p) => p.beat)) + (step || 0.25))) }}>Duplicate</button><button disabled={!selected.size} onClick={remove}>Delete points</button><button onClick={() => change([])}>Clear lane</button><label>Paste at <input aria-label="Paste beat" type="number" min={0} max={clip.lengthBeats} step={step || 'any'} value={pasteBeat} onChange={(e) => setPasteBeat(Number(e.target.value))} /></label></div>
      <div className={styles.scroll}><div style={{ width: `${zoom * 100}%` }}><div className={styles.ruler}>{Array.from({ length: Math.ceil(clip.lengthBeats) + 1 }, (_, i) => <span key={i} style={{ left: `${i / clip.lengthBeats * 100}%` }}>{i}</span>)}</div><svg className={styles.canvas} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-label="Automation drawing area" role="application" tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} onKeyDown={(e) => {
        const cmd = e.metaKey || e.ctrlKey
        if (cmd && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(points.map((p) => p.id))) }
        if (cmd && e.key.toLowerCase() === 'c') { e.preventDefault(); copy() }
        if (cmd && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(); remove() }
        if (cmd && e.key.toLowerCase() === 'v') { e.preventDefault(); paste() }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
      }}>
        {Array.from({ length: Math.min(1024, Math.ceil(clip.lengthBeats / (step || 1))) }, (_, i) => <line key={i} x1={i * (step || 1) / clip.lengthBeats * 1000} x2={i * (step || 1) / clip.lengthBeats * 1000} y1={0} y2={100} className={styles.grid} />)}
        <path d={path} className={styles.curve} />{points.map((p) => <ellipse key={p.id} data-point-id={p.id} cx={p.beat / clip.lengthBeats * 1000} cy={100 - p.value * 100} rx={6 / zoom} ry={2.3} className={selected.has(p.id) ? styles.selected : styles.point}><title>{p.beat} beats · {available ? formatParam(available.spec, controlFromNormalized(available.spec, p.value)) : p.value}</title></ellipse>)}{phase !== undefined && <line x1={phase * 1000} x2={phase * 1000} y1={0} y2={100} className={styles.playhead} />}
      </svg></div></div>
      {only && <div className={styles.toolbar}><label>Beat <input key={`beat:${only.id}:${only.beat}`} aria-label="Point beat" type="number" defaultValue={only.beat} min={0} max={clip.lengthBeats} step={step || 'any'} onBlur={(e) => change(points.map((p) => p.id === only.id ? { ...p, beat: Number(e.target.value) } : p))} /></label><label>Value {available?.spec.unit ?? ''}<input key={`value:${only.id}:${only.value}`} aria-label="Point value" type="number" step="any" defaultValue={available ? controlFromNormalized(available.spec, only.value) : only.value} onBlur={(e) => change(points.map((p) => p.id === only.id ? { ...p, value: available ? controlToNormalized(available.spec, Number(e.target.value)) : Number(e.target.value) } : p))} /></label><label>Segment <select aria-label="Point interpolation" value={only.interpolation} onChange={(e) => change(points.map((p) => p.id === only.id ? { ...p, interpolation: e.target.value as 'linear' | 'hold' } : p))}><option value="linear">Linear</option><option value="hold">Hold</option></select></label></div>}
      <p className={styles.hint}>{points.length} / {MAX_AUTOMATION_POINTS} points · Click to draw · drag selected points · Shift-click to select · ⌘/Ctrl A/C/X/V · Delete · times are beats, values follow the control scale{available && points.length ? ` · first: ${formatParam(available.spec, controlFromNormalized(available.spec, automationPosition(lane, 0)!))}` : ''}</p></> : <p className={styles.hint}>Add a target to draw automation. Empty lanes leave base values unchanged.</p>}</div>
    </div>
  </section>
}
