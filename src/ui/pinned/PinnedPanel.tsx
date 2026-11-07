import { type LivePin, type ModuleLibrary, type Patch, controlOwnerId, livePins, pinTarget } from '@core'
import { type Subject, runAction, useProjectSelect, useProjectStore } from '@state'
import { memo } from 'react'
import { PanelView } from '../panel/PanelView'
import { Icon } from '../shared/icon'
import { ActionMenu, useActionContext } from '../shared/menu'
import { pinTitle } from './pin-title'
import styles from './PinnedView.module.css'

const samePin = (a: LivePin | undefined, b: LivePin | undefined) => a?.pin === b?.pin && a?.patch === b?.patch

/**
 * One pin: a header with the owner's name and graph, *Open* and *Unpin*, over the graph's front panel (play only).
 * Reads only its own pin, title and colour, so a knob turned in another pin doesn't re-render it.
 */
export const PinnedPanel = memo(({ pinKey }: { pinKey: string }) => {
  const context = useActionContext()
  const live = useProjectSelect((project) => livePins(project).find((entry) => entry.key === pinKey), samePin)
  const title = useProjectSelect((project) => (live ? pinTitle(project, live.pin) : undefined) ?? '', Object.is)
  const colour = useProjectSelect(
    (project) => (live?.pin.owner.kind === 'group' ? project.groups?.find((group) => live.pin.owner.kind === 'group' && group.id === live.pin.owner.groupId)?.colour : undefined),
    Object.is,
  )
  const modules = useProjectStore((state) => state.project.modules)
  if (!live) return null
  const { pin, patch } = live
  const subject: Subject = { kind: 'pin', owner: pin.owner, graph: pin.graph }
  const run = (id: string) => runAction(id, subject, context)
  const collapsed = pin.collapsed ?? false
  const edit = (change: (patch: Patch, modules: ModuleLibrary) => Patch, mergeKey?: string) =>
    useProjectStore.getState().editPatch(pinTarget(pin), change, mergeKey)
  return (
    <section className={styles.pin} aria-label={title} data-pin-key={pinKey} data-collapsed={collapsed || undefined}>
      <ActionMenu subject={subject}>
        <header className={styles.header} tabIndex={-1}>
          <button className={styles.twisty} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`} onClick={() => run('pin.collapse')}>
            <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
          </button>
          {colour && <span className={styles.swatch} style={{ background: `var(--group-${colour})` }} aria-hidden />}
          <span className={styles.title} title="Double-click to open the full editor" onDoubleClick={() => run('pin.open')}>
            {title}
          </span>
          <button className={styles.open} title="Open the full editor" onClick={() => run('pin.open')}>
            Open
          </button>
          <button className={styles.unpin} aria-label={`Unpin ${title}`} title="Unpin" onClick={() => run('pin.unpin')}>
            <Icon name="close" size={14} />
          </button>
        </header>
      </ActionMenu>
      {!collapsed && (
        <PanelView
          variant="pinned"
          patch={patch}
          modules={modules}
          controlOwner={pin.owner}
          controlDomain={pin.graph}
          // The editor's scope, so undo keys merge alike.
          scope={`${controlOwnerId(pin.owner) ?? 'master'}:${pin.graph}`}
          readoutTrack={controlOwnerId(pin.owner) ?? 'master'}
          edit={edit}
          onOpen={() => run('pin.open')}
        />
      )}
    </section>
  )
})
