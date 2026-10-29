import { useLayoutStore, type ViewId } from '@state'
import { type BorderNode, type IJsonModel, type ITabRenderValues, type ITabSetRenderValues, Layout, Model, type TabNode, type TabSetNode } from 'flexlayout-react'
import 'flexlayout-react/style/dark.css'
import { type MouseEvent, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useKeyLabel, withKey } from '../commands/CommandHost'
import { useSpringLoad } from '../shared/drag'
import { defaultLayout, LAYOUT_PRESETS, PANEL_GROUP, presetLayout } from './default-layout'
import './flex-theme.css'
import { viewOfTab } from './group-focus'
import { FlexLayoutDriver } from './layout-driver'
import { RegionToggles } from './RegionToggles'
import type { LayoutPersistence } from './use-layout-persistence'
import { MAIN_VIEW_TOOLTIPS } from './view-titles'
import { ViewTab } from './ViewHost'
import styles from './Workbench.module.css'

const factory = (node: TabNode) => <ViewTab node={node} />

/** The panel's tab strip ends with the region toggles, before flexlayout's maximize button. */
const renderTabSet = (node: TabSetNode | BorderNode, values: ITabSetRenderValues) => {
  if (node.getId() === PANEL_GROUP) values.buttons.push(<RegionToggles key="region-toggles" />)
}

/** flexlayout's labels that differ from ours, with the maximize key; every other text (tab names among them) passes through. */
const translatorFor = (maximizeKey: string | undefined) => {
  const labels: Readonly<Record<string, string>> = {
    'flexlayout.ui.maximize.tabset': withKey('Maximize', maximizeKey),
    'flexlayout.ui.restore.tabset': withKey('Restore', maximizeKey),
  }
  return (key: string): string => labels[key] ?? key
}

/** Session's and Arrangement's tabs name the key that switches them, which can change, so they are drawn with it. */
const tabRendererFor = (mainKey: string | undefined) => (node: TabNode, values: ITabRenderValues) => {
  const tooltip = MAIN_VIEW_TOOLTIPS[node.getId() as ViewId]
  if (tooltip) values.content = <span title={withKey(tooltip, mainKey)}>{node.getName()}</span>
}

/**
 * The docking layout. flexlayout owns the layout tree; the layout store is a façade over it, through the driver
 * this registers. *Reset layout* and loading a named layout replace the model, and the `generation` key remounts
 * the layout with it.
 */
export const Workbench = ({ persistence }: { persistence: LayoutPersistence }) => {
  const [{ model, generation }, setLayout] = useState(() => ({ model: persistence.initial, generation: 0 }))
  const driver = useRef<FlexLayoutDriver | null>(null)
  const maximizeKey = useKeyLabel('layout.maximize')
  const mainKey = useKeyLabel('view.toggle-main')
  const translate = useCallback(translatorFor(maximizeKey), [maximizeKey])
  const renderTab = useCallback(tabRendererFor(mainKey), [mainKey])

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
      loadPreset: (id) => {
        const preset = LAYOUT_PRESETS.find((candidate) => candidate.id === id)
        if (preset) replace(presetLayout(preset.id))
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
        onRenderTab={renderTab}
        onRenderTabSet={renderTabSet}
        onAction={(action) => driver.current?.intercept(action) ?? action}
        onModelChange={onModelChange}
      />
    </div>
  )
}
