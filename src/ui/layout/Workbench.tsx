import { groupIn, useLayoutStore } from '@state'
import { Layout, Model, type TabNode } from 'flexlayout-react'
import 'flexlayout-react/style/dark.css'
import { useLayoutEffect, useRef, useState } from 'react'
import { defaultLayout } from './default-layout'
import './flex-theme.css'
import { FlexLayoutDriver } from './layout-driver'
import { ViewTab } from './ViewHost'
import styles from './Workbench.module.css'

const factory = (node: TabNode) => <ViewTab node={node} />

/** Starts from the default layout, on the editor view the store already shows (restored from storage). */
const initialModel = () => Model.fromJson(defaultLayout({ editorView: groupIn(useLayoutStore.getState(), 'editor')?.active }))

/**
 * The docking layout. flexlayout owns the layout tree; the layout store is a façade over it, through the driver
 * this registers. *Reset layout* replaces the model, and the `generation` key remounts the layout with it.
 */
export const Workbench = () => {
  const [{ model, generation }, setLayout] = useState(() => ({ model: initialModel(), generation: 0 }))
  const driver = useRef<FlexLayoutDriver | null>(null)

  // A layout Effect, so the driver is attached before the views' Effects can reveal anything.
  useLayoutEffect(() => {
    const store = useLayoutStore.getState()
    const reset = () => setLayout((current) => ({ model: Model.fromJson(defaultLayout()), generation: current.generation + 1 }))
    const next = new FlexLayoutDriver(model, store.sync, reset)
    driver.current = next
    next.sync()
    const detach = store.attachDriver(next)
    return () => {
      detach()
      if (driver.current === next) driver.current = null
    }
  }, [model])

  return (
    <div className={styles.workbench}>
      <Layout key={generation} model={model} factory={factory} onModelChange={() => driver.current?.sync()} />
    </div>
  )
}
