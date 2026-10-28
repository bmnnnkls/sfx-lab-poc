import { useLayoutStore } from '@state'
import { type BorderNode, type IJsonModel, type ITabSetRenderValues, Layout, Model, type TabNode, type TabSetNode } from 'flexlayout-react'
import 'flexlayout-react/style/dark.css'
import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSpringLoad } from '../shared/drag'
import { defaultLayout, PANEL_GROUP } from './default-layout'
import './flex-theme.css'
import { groupToFocus, tabButtonId, viewOfElement, viewOfTab } from './group-focus'
import { FlexLayoutDriver } from './layout-driver'
import { RegionToggles } from './RegionToggles'
import type { LayoutPersistence } from './use-layout-persistence'
import { ViewTab } from './ViewHost'
import styles from './Workbench.module.css'

const factory = (node: TabNode) => <ViewTab node={node} />

/** The panel's tab strip ends with the region toggles, before flexlayout's maximize button. */
const renderTabSet = (node: TabSetNode | BorderNode, values: ITabSetRenderValues) => {
  if (node.getId() === PANEL_GROUP) values.buttons.push(<RegionToggles key="region-toggles" />)
}

/** flexlayout's labels that differ from ours; every other text (tab names among them) passes through. */
const LABELS: Readonly<Record<string, string>> = {
  'flexlayout.ui.maximize.tabset': 'Maximize',
  'flexlayout.ui.restore.tabset': 'Restore',
}
const translate = (key: string): string => LABELS[key] ?? key

/**
 * The docking layout. flexlayout owns the layout tree; the layout store is a façade over it, through the driver
 * this registers. *Reset layout* and loading a named layout replace the model, and the `generation` key remounts
 * the layout with it.
 */
export const Workbench = ({ persistence }: { persistence: LayoutPersistence }) => {
  const [{ model, generation }, setLayout] = useState(() => ({ model: persistence.initial, generation: 0 }))
  const driver = useRef<FlexLayoutDriver | null>(null)

  // A layout Effect, so the driver is attached before the views' Effects can reveal anything.
  useLayoutEffect(() => {
    const store = useLayoutStore.getState()
    const replace = (json: IJsonModel) => {
      const fresh = Model.fromJson(json)
      persistence.replaced(fresh)
      setLayout((current) => ({ model: fresh, generation: current.generation + 1 }))
    }
    const next = new FlexLayoutDriver(model, store.sync, {
      reset: () => replace(defaultLayout()),
      load: (name) => {
        const json = persistence.named(name)
        if (json) replace(json)
      },
      saveAs: (name) => persistence.saveNamed(name, model.toJson()),
    })
    driver.current = next
    next.sync()
    const detach = store.attachDriver(next)
    return () => {
      detach()
      if (driver.current === next) driver.current = null
    }
  }, [model, persistence])

  // F6 and Shift+F6 move the focus to the next or previous tab group, the panel and sidebars included.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F6' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = groupToFocus(useLayoutStore.getState(), viewOfElement(document.activeElement), event.shiftKey ? -1 : 1)
      const button = target && document.getElementById(tabButtonId(target))
      if (!button) return
      event.preventDefault()
      button.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Every change, the user's and the driver's: mirror it, and save the layout.
  const onModelChange = () => {
    driver.current?.sync()
    persistence.changed(model)
  }

  // Before flexlayout sees it, which ignores clicks on a group's open tab: the panel's collapses or expands it.
  const onClickCapture = (event: MouseEvent) => {
    const id = viewOfTab(event.target as Element)
    if (id) driver.current?.clickTab(id)
  }

  // A drag of ours held on the tab of a view that isn't showing shows it, a collapsed sidebar or panel included.
  const springLoad = useSpringLoad(viewOfTab, (id) => {
    if (!useLayoutStore.getState().visible.includes(id)) useLayoutStore.getState().revealView(id)
  })

  return (
    <div className={styles.workbench} onClickCapture={onClickCapture} {...springLoad}>
      <Layout
        key={generation}
        model={model}
        factory={factory}
        i18nTranslator={translate}
        onRenderTabSet={renderTabSet}
        onAction={(action) => driver.current?.intercept(action) ?? action}
        onModelChange={onModelChange}
      />
    </div>
  )
}
