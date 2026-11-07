import { type TrackRow, trackRows } from '@core'
import { type SubjectOf, runAction, useProjectStore, useSelectionStore } from '@state'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { Icon } from '../shared/icon'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { useSounding } from '../shared/use-sounding'
import styles from './TracksView.module.css'

const keyOf = (row: TrackRow) => (row.kind === 'group' ? `g:${row.group.id}` : `t:${row.track.id}`)
const subjectOf = (row: TrackRow): SubjectOf<'track' | 'group'> =>
  row.kind === 'group' ? { kind: 'group', groupId: row.group.id } : { kind: 'track', trackId: row.track.id }

/** Selects a row's track or group, and asks the Session and Arrangement views to scroll it into view. */
const chooseRow = (row: TrackRow) => {
  const selection = useSelectionStore.getState()
  if (row.kind === 'track') selection.selectTrack(row.track.id)
  else selection.selectGroup(row.group.id)
  selection.requestReveal(row.kind, row.kind === 'track' ? row.track.id : row.group.id)
}

/** The rows the tree shows: everything but what is inside a collapsed group. Hidden tracks show, dimmed. */
const treeRows = (rows: readonly TrackRow[]): TrackRow[] => {
  const shown: TrackRow[] = []
  let skipBelow = Infinity
  for (const row of rows) {
    if (row.depth > skipBelow) continue
    skipBelow = Infinity
    shown.push(row)
    if (row.kind === 'group' && row.group.collapsed) skipBelow = row.depth
  }
  return shown
}

/**
 * The "Tracks" view: tracks and groups as a tree (the WAI-ARIA tree view pattern), the clip tracks group by group, then
 * the returns. One row is in the tab order; arrow keys move through the rows, Right and Left expand and collapse a
 * group (its `collapsed` flag, so every view follows), Enter selects a track or a group, Alt+Up and Alt+Down move the row. Rows
 * drag onto each other; each has the menu of its track or group and an eye that hides or shows it.
 */
export const TracksView = () => {
  const rows = useProjectStore((state) => trackRows(state.project))
  const shown = useMemo(() => treeRows(rows), [rows])
  const hidden = useMemo(() => new Set(rows.flatMap((row) => (row.kind === 'track' && row.track.hidden ? [row.track.id] : []))), [rows])
  const groups = rows.flatMap((row) => (row.kind === 'group' ? [row.group] : []))
  const selected = useSelectionStore((state) => state.trackId)
  const selectedGroup = useSelectionStore((state) => state.groupId)
  const context = useActionContext()
  const [chosen, setChosen] = useState<string | null>(null)
  const tree = useRef<HTMLUListElement>(null)
  const focusAfterKey = useRef(false)
  // The row in the tab order: the one last moved to, else the selected track, else the first.
  const active =
    shown.find((row) => keyOf(row) === chosen) ??
    shown.find((row) => row.kind === 'track' && row.track.id === selected) ??
    shown[0]
  useEffect(() => {
    if (!focusAfterKey.current) return
    focusAfterKey.current = false
    tree.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  })

  const store = useProjectStore.getState
  const goTo = (row: TrackRow | undefined) => {
    if (!row) return
    focusAfterKey.current = true
    setChosen(keyOf(row))
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!active) return
    const index = shown.indexOf(active)
    const group = active.kind === 'group' ? active.group : undefined
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      runAction(`${active.kind}.move-${event.key === 'ArrowUp' ? 'up' : 'down'}`, subjectOf(active), context)
      goTo(active)
      return
    }
    switch (event.key) {
      case 'ArrowDown': goTo(shown[index + 1]); break
      case 'ArrowUp': goTo(shown[index - 1]); break
      case 'Home': goTo(shown[0]); break
      case 'End': goTo(shown.at(-1)); break
      case 'ArrowRight':
        if (group?.collapsed) store().setGroupCollapsed(group.id, false)
        else if (group) goTo(shown[index + 1])
        break
      case 'ArrowLeft':
        if (group && !group.collapsed) store().setGroupCollapsed(group.id, true)
        else goTo(shown.slice(0, index).reverse().find((row) => row.kind === 'group' && row.depth === active.depth - 1))
        break
      case 'Enter':
      case ' ':
        chooseRow(active)
        break
      default:
        return
    }
    event.preventDefault()
  }

  if (rows.length === 0) {
    return (
      <div className={styles.view}>
        <div className={styles.empty}>
          <p>No tracks yet.</p>
          <button onClick={() => store().addTrack()}>Instrument track</button>
          <button onClick={() => store().addAudioTrack()}>Audio track</button>
        </div>
      </div>
    )
  }

  const firstReturn = shown.find((row) => row.kind === 'track' && row.track.kind === 'return')
  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        {hidden.size > 0 && <button onClick={() => store().showAllTracks()}>Show all</button>}
        {groups.length > 0 && (
          <>
            <button onClick={() => groups.forEach((candidate) => store().setGroupCollapsed(candidate.id, true))}>Collapse all</button>
            <button onClick={() => groups.forEach((candidate) => store().setGroupCollapsed(candidate.id, false))}>Expand all</button>
          </>
        )}
      </div>
      <ul ref={tree} role="tree" aria-label="Tracks" className={styles.tree} onKeyDown={onKeyDown}>
        {shown.map((row) => (
          <Row
            key={keyOf(row)}
            row={row}
            label={row === firstReturn ? 'Returns' : undefined}
            active={row === active}
            selected={row.kind === 'track' ? row.track.id === selected : row.group.id === selectedGroup}
            hidden={row.kind === 'track' ? hidden.has(row.track.id) : row.trackIds.every((id) => hidden.has(id))}
            onChoose={() => setChosen(keyOf(row))}
          />
        ))}
      </ul>
    </div>
  )
}

interface RowProps {
  readonly row: TrackRow
  /** A heading drawn before the row (the returns'). */
  readonly label?: string
  readonly active: boolean
  readonly selected: boolean
  /** The track is hidden, or every track of the group is. */
  readonly hidden: boolean
  onChoose(): void
}

const Row = ({ row, label, active, selected, hidden, onChoose }: RowProps) => {
  const subject = subjectOf(row)
  const context = useActionContext()
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  const drop = useEdgeTarget(subject, 'y')
  const name = row.kind === 'group' ? row.group.name : row.track.name
  const count = row.kind === 'group' ? row.trackIds.length : 0
  const description =
    row.kind === 'group'
      ? `${name}, group of ${count} track${count === 1 ? '' : 's'}`
      : `${name}${row.track.kind === 'instrument' ? '' : `, ${row.track.kind}`}`
  const toggleHidden = () => runAction(row.kind === 'group' ? 'group.hide' : 'track.hide', subject, context)

  return (
    <>
      {label && <li role="none" className={styles.label} aria-hidden>{label}</li>}
      <ActionMenu subject={subject}>
        <li
          role="treeitem"
          aria-level={row.depth + 1}
          aria-selected={selected}
          aria-expanded={row.kind === 'group' ? !row.group.collapsed : undefined}
          aria-label={hidden ? `${description}, hidden` : description}
          tabIndex={active ? 0 : -1}
          className={`${styles.row} ${selected ? styles.selected : ''} ${hidden ? styles.hidden : ''}`}
          style={{ paddingInlineStart: 4 + row.depth * 14 }}
          {...drag}
          {...drop}
          onClick={() => {
            onChoose()
            chooseRow(row)
          }}
        >
          <span
            className={styles.twisty}
            aria-hidden
            onClick={(event) => {
              if (row.kind !== 'group') return
              event.stopPropagation()
              useProjectStore.getState().setGroupCollapsed(row.group.id, !row.group.collapsed)
            }}
          >
            {row.kind === 'group' && <Icon name={row.group.collapsed ? 'chevron-right' : 'chevron-down'} size={14} />}
          </span>
          {row.kind === 'group' && <span className={styles.swatch} style={{ background: `var(--group-${row.group.colour})` }} aria-hidden />}
          <InPlaceRename subject={subject} name={name} label={`Name of ${name}`} className={styles.name}>
            <span className={styles.name}>{name}</span>
          </InPlaceRename>
          {row.kind === 'track' && row.track.kind !== 'instrument' && <span className={styles.tag} aria-hidden>{row.track.kind}</span>}
          {row.kind === 'group' && row.group.bus && <span className={styles.tag} aria-hidden>bus</span>}
          {row.kind === 'group' && <span className={styles.count} aria-hidden>{count}</span>}
          {hidden && <SoundingDot trackIds={row.kind === 'group' ? row.trackIds : [row.track.id]} />}
          <button
            className={styles.eye}
            tabIndex={-1}
            aria-label={`${hidden ? 'Show' : 'Hide'} ${name}`}
            title={hidden ? 'Show' : 'Hide'}
            onClick={(event) => {
              event.stopPropagation()
              toggleHidden()
            }}
          >
            <Icon name={hidden ? 'eye-off' : 'eye'} size={14} />
          </button>
        </li>
      </ActionMenu>
    </>
  )
}

/** Lit while a hidden track sounds, so something playing out of sight is noticed. */
const SoundingDot = ({ trackIds }: { trackIds: readonly string[] }) => {
  const sounding = useSounding(trackIds)
  return <span className={`${styles.dot} ${sounding ? styles.sounding : ''}`} data-sounding={sounding || undefined} title={sounding ? 'Hidden and sounding' : 'Hidden'} aria-hidden />
}
