import { type ControlOwner, type Project, type ProjectPreset, type SampleTarget, type Snapshot, type SnapshotScope, controlGraph, controlOwnerId, editSampleBinding, enumerateSampleTargets, inSnapshotScope, morphSnapshots, nodeTitles, resolveSampleTarget, sampleTargetKey } from '@core'
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react'
import { type SoundsTab, editPresetProject, isStillRecalled, morphPair, recallablePresets, runAction, saveSound, soundSubject, soundsTabsOf, tabFor, useProjectStore, useSelectionStore, useSoundsStore } from '@state'
import { useControlGesture } from '../controls/use-control-gesture'
import { useDragSource } from '../shared/drag'
import { ActionMenu, PopupMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { LibrarySounds } from './LibrarySounds'
import styles from './SoundsPanel.module.css'

const TAB_TITLES: Readonly<Record<SoundsTab, string>> = { patch: 'Instrument', fx: 'Effects', notes: 'Notes', track: 'Track' }
const SHOW_ALL_KEY = 'sfxlab:sounds-show-all'

const sameOwner = (a: ControlOwner, b: ControlOwner) => a.kind === b.kind && controlOwnerId(a) === controlOwnerId(b)
const ownerNameIn = (project: Project, owner: ControlOwner) =>
  owner.kind === 'master' ? 'Master' : owner.kind === 'group' ? project.groups?.find((group) => group.id === owner.groupId)?.name ?? 'Missing group' : project.tracks.find((track) => track.id === owner.trackId)?.name ?? 'Missing track'

/** *Show all in project*, kept per browser. Storage can be missing or blocked, so every access is guarded. */
const useShowAllStorage = () => {
  const showAll = useSoundsStore((state) => state.showAll)
  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_ALL_KEY) === 'true') useSoundsStore.getState().setShowAll(true)
    } catch {
      // Unreadable: the default.
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(SHOW_ALL_KEY, String(showAll))
    } catch {
      // Not persisted; the view still works.
    }
  }, [showAll])
  return showAll
}

/** A sample choice's name: the titles of the nodes along its path, *Drum sampler / Kick pad*. */
const sampleChoiceName = (project: Project, target: SampleTarget): string => {
  let graph = controlGraph(project, target.owner, target.domain)
  const names: string[] = []
  for (const nodeId of [...target.path.map((step) => step.nodeId), target.nodeId]) {
    names.push((graph && nodeTitles(graph, project.modules).get(nodeId)) ?? nodeId)
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId)
    graph = node?.type === 'module' ? project.modules.find((module) => module.id === node.moduleId)?.patch : undefined
  }
  return names.join(' / ')
}

interface SoundRowProps {
  readonly sound: Snapshot | ProjectPreset
  readonly preset: boolean
  /** The selected owner it recalls onto; none with *Show all*, where it recalls onto its own. */
  readonly onto?: ControlOwner
  /** Another owner's preset names its owner. */
  readonly from?: string
  /** The row's tooltip: where a click recalls it. */
  readonly hint: string
  readonly recalled: boolean
  readonly ends: { readonly a: boolean; readonly b: boolean }
  onRecall(subject: ReturnType<typeof soundSubject>): void
}

/** A sound's row: click or Enter recalls it, its menu has the rest, and a preset drags onto a track whose graph matches. */
const SoundRow = ({ sound, preset, onto, from, hint, recalled, ends, onRecall }: SoundRowProps) => {
  const subject = soundSubject(sound.id, preset, onto)
  const renaming = useRenaming(subject)
  const drag = useDragSource(preset && !renaming ? soundSubject(sound.id, true) : null)
  const kindId = useId()
  const recall = () => onRecall(subject)
  const keys = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    recall()
  }
  return (
    <li>
      <ActionMenu subject={subject}>
        <div
          className={styles.row}
          {...(!renaming && { role: 'button', tabIndex: 0, 'aria-label': `Recall ${sound.name}`, 'aria-describedby': kindId, onClick: recall, onKeyDown: keys })}
          title={hint}
          data-recalled={recalled || undefined}
          {...drag}
        >
          <span className={styles.mark} aria-hidden>{recalled ? '●' : ''}</span>
          <InPlaceRename subject={subject} name={sound.name} label={`Name of ${sound.name}`} className={styles.name}>
            <span className={styles.name}>{sound.name}</span>
          </InPlaceRename>
          <span id={kindId} className={styles.kind}>
            {preset ? 'Preset' : 'Snapshot'}{from ? ` · ${from}` : ''}{recalled && <span className={styles.hidden}>, recalled</span>}
            {ends.a && <span className={styles.end} title="The morph's A end"> A</span>}
            {ends.b && <span className={styles.end} title="The morph's B end"> B</span>}
          </span>
        </div>
      </ActionMenu>
    </li>
  )
}

/** The presets and snapshots of the selected owner's graph: recall on click, morph between two, save in one click. */
export const SoundsPanel = () => {
  const project = useProjectStore((s) => s.project)
  const trackId = useSelectionStore((s) => s.trackId), master = useSelectionStore((s) => s.master), groupId = useSelectionStore((s) => s.groupId)
  const chosen = useSoundsStore((s) => s.tab), a = useSoundsStore((s) => s.a), b = useSoundsStore((s) => s.b), recalledMark = useSoundsStore((s) => s.recalled)
  const showAll = useShowAllStorage()
  const [message, setMessage] = useState('')
  const [amount, setAmount] = useState(0)
  const gesture = useControlGesture()
  const context = useActionContext()
  // A selected group acts through its bus, which has only effects and a mixer, as the master has.
  const group = groupId === null ? undefined : project.groups?.find((candidate) => candidate.id === groupId)
  const owner: ControlOwner = master ? { kind: 'master' } : group ? { kind: 'group', groupId: group.id } : { kind: 'track', trackId: trackId ?? project.tracks[0]?.id ?? '' }
  const ownerExists = owner.kind !== 'track' || project.tracks.some((track) => track.id === owner.trackId)
  const tabs = soundsTabsOf(project, owner)
  const tab = tabFor(chosen, tabs)
  const scope: SnapshotScope = { owner, domain: tab }
  const ownerKey = JSON.stringify(owner)

  const presets = useMemo(() => (showAll ? [] : recallablePresets(project, owner, tab)), [project, ownerKey, tab, showAll])
  const snapshots = (project.snapshots ?? []).filter((snapshot) => sameOwner(snapshot.scope.owner, owner) && snapshot.scope.domain === tab)
  const recalledId = useMemo(() => (recalledMark && isStillRecalled(project, recalledMark, !!project.presets?.some((p) => p.id === recalledMark.soundId)) ? recalledMark.soundId : null), [project, recalledMark])
  const pair = useMemo(() => morphPair(project, a, b), [project.snapshots, a, b])

  const report = (_kind: 'info' | 'error', text: string) => setMessage(text)
  const recall = (subject: ReturnType<typeof soundSubject>) => void runAction('sound.recall', subject, context, { report })
  const act = (run: () => string | void) => {
    try {
      setMessage(run() ?? '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sound action failed')
    }
  }
  const save = (kind: 'preset' | 'snapshot') => act(() => saveSound(kind, scope, context, showAll ? undefined : owner))
  const row = (sound: Snapshot | ProjectPreset, preset: boolean, onto?: ControlOwner) => (
    <SoundRow
      key={sound.id}
      sound={sound}
      preset={preset}
      onto={onto}
      from={onto && !sameOwner(sound.scope.owner, onto) ? ownerNameIn(project, sound.scope.owner) : undefined}
      hint={`Recall onto ${ownerNameIn(project, onto ?? sound.scope.owner)}`}
      recalled={recalledId === sound.id && sameOwner(recalledMark!.scope.owner, onto ?? sound.scope.owner)}
      ends={{ a: !preset && a === sound.id, b: !preset && b === sound.id }}
      onRecall={recall}
    />
  )

  // With Show all, every sound under its owner and graph, recalled onto its own owner.
  const groups = useMemo(() => {
    if (!showAll) return []
    const byScope = new Map<string, { scope: SnapshotScope; sounds: { sound: Snapshot | ProjectPreset; preset: boolean }[] }>()
    for (const [list, preset] of [[project.presets ?? [], true], [project.snapshots ?? [], false]] as const)
      for (const sound of list) {
        const key = JSON.stringify(sound.scope)
        if (!byScope.has(key)) byScope.set(key, { scope: sound.scope, sounds: [] })
        byScope.get(key)!.sounds.push({ sound, preset })
      }
    return [...byScope.values()]
  }, [showAll, project.presets, project.snapshots])

  const samples = enumerateSampleTargets(project).filter((target) => inSnapshotScope(target, scope))
  const empty = showAll ? groups.length === 0 : presets.length === 0 && snapshots.length === 0
  return (
    <section className={styles.panel} aria-label="Sounds">
      <div className={styles.header}>
        <strong className={styles.owner} title={ownerExists ? ownerNameIn(project, owner) : undefined}>{ownerExists ? ownerNameIn(project, owner) : 'Select a track'}</strong>
        <div role="tablist" aria-label="Graph" className={styles.tabs}>
          {tabs.map((id) => (
            <button key={id} role="tab" aria-selected={id === tab} tabIndex={id === tab ? 0 : -1} onClick={() => useSoundsStore.getState().setTab(id)}>
              {TAB_TITLES[id]}
            </button>
          ))}
        </div>
        <PopupMenu entries={[{ label: 'Show all in project', checked: showAll, tooltip: "Every preset and snapshot of the project, under its owner; a click recalls it onto its own", onSelect: () => useSoundsStore.getState().setShowAll(!showAll) }]}>
          <button className={styles.more} aria-label="Sounds actions" title="Sounds actions">⋯</button>
        </PopupMenu>
      </div>
      <output role="status" className={styles.status}>{message}</output>
      <div className={styles.sounds}>
        {empty ? (
          <p className={styles.empty}>Save a preset to keep this sound and use it on other tracks; save a snapshot to remember knob positions here and morph between them.</p>
        ) : showAll ? (
          groups.map(({ scope: each, sounds }) => (
            <section key={JSON.stringify(each)} className={styles.group}>
              <h3>{ownerNameIn(project, each.owner)} · {TAB_TITLES[each.domain]}</h3>
              <ul className={styles.list}>{sounds.map(({ sound, preset }) => row(sound, preset))}</ul>
            </section>
          ))
        ) : (
          <section className={styles.group}>
            <h3>In this project</h3>
            <ul className={styles.list} aria-label={`Sounds of ${ownerNameIn(project, owner)}`}>
              {presets.map((preset) => row(preset, true, owner))}
              {snapshots.map((snapshot) => row(snapshot, false, owner))}
            </ul>
          </section>
        )}
        {!showAll && ownerExists && tab !== 'track' && <LibrarySounds owner={owner} domain={tab} ownerName={ownerNameIn(project, owner)} onReport={setMessage} />}
      </div>
      <div className={styles.buttons}>
        {tab !== 'track' && <button disabled={!ownerExists} aria-label="Save preset" title={`A preset of ${TAB_TITLES[tab]}, to use on other tracks`} onClick={() => save('preset')}>+ Save preset</button>}
        <button disabled={!ownerExists} aria-label="Save snapshot" title={`The knob positions of ${TAB_TITLES[tab]}, to recall or morph`} onClick={() => save('snapshot')}>+ Snapshot</button>
      </div>
      {pair && (
        <div className={styles.morph}>
          <span>Morph</span>
          <span className={styles.endName}>{pair[0].name}</span>
          <input
            type="range"
            aria-label="Morph"
            min={0}
            max={1}
            step={0.001}
            value={amount}
            {...gesture.events}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onChange={(event) => act(() => {
              const value = Number(event.target.value)
              gesture.change(morphSnapshots(project, pair[0], pair[1], value).values)
              setAmount(value)
              return `Morph ${Math.round(value * 100)}% · discrete controls switch at 50%`
            })}
          />
          <span className={styles.endName}>{pair[1].name}</span>
        </div>
      )}
      {samples.length > 0 && (
        <details className={styles.samples}>
          <summary>Sample choices ({samples.length})</summary>
          <p>For this use only; the node's own sample stays the default. Presets keep silence too.</p>
          {samples.map((target) => {
            const key = sampleTargetKey(target), binding = project.sampleBindings?.find((candidate) => sampleTargetKey(candidate.target) === key), resolved = resolveSampleTarget(project, target)
            const name = sampleChoiceName(project, target)
            return (
              <label className={styles.sample} key={key}>
                <span>{name}</span>
                <select aria-label={`Sample for ${name}`} value={binding ? binding.sampleId ?? '' : '__default'} onChange={(event) => act(() => editPresetProject((value) => event.target.value === '__default'
                  ? { ...value, sampleBindings: value.sampleBindings?.filter((candidate) => sampleTargetKey(candidate.target) !== key) }
                  : editSampleBinding(value, { target, sampleId: event.target.value || null })))}>
                  <option value="__default">Default{resolved.status === 'available' && !binding ? ` (${project.samples.find((sample) => sample.id === resolved.sampleId)?.name ?? 'silence'})` : ''}</option>
                  <option value="">Silence</option>
                  {project.samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.name}</option>)}
                </select>
              </label>
            )
          })}
        </details>
      )}
    </section>
  )
}
