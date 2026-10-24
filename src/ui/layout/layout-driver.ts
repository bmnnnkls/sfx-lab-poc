import type { GroupState, LayoutDriver, LayoutSnapshot, RegionId, ViewId } from '@state'
import { Actions, BorderNode, DockLocation, Model, TabNode, TabSetNode } from 'flexlayout-react'
import { BORDER_LOCATIONS, borderId, defaultRegionOf, viewTab } from './default-layout'

const borderOf = (model: Model, region: RegionId): BorderNode | undefined => {
  const location = BORDER_LOCATIONS[region]
  const node = location && model.getNodeById(borderId(location))
  return node instanceof BorderNode ? node : undefined
}

const EDGE_REGIONS = Object.keys(BORDER_LOCATIONS) as RegionId[]

const viewIds = (tabs: readonly TabNode[]): ViewId[] => tabs.map((tab) => tab.getId() as ViewId)

/**
 * The shell's side of the layout store's façade: it carries out the store's actions on flexlayout's model and
 * mirrors the model back as a `LayoutSnapshot`. One per model; *Reset layout* makes a new model.
 */
export class FlexLayoutDriver implements LayoutDriver {
  /** The tab each border showed last, so showing a collapsed border brings that tab back. */
  private readonly lastShown = new Map<string, ViewId>()

  constructor(
    readonly model: Model,
    private readonly publish: (snapshot: LayoutSnapshot) => void,
    private readonly onReset: () => void,
  ) {}

  /** What the store mirrors. Computed from the model, not from flexlayout's visibility events, so it is current. */
  snapshot(): LayoutSnapshot {
    const groups: GroupState[] = []
    const visible: ViewId[] = []
    const hiddenRegions: RegionId[] = []
    const maximized = this.model.getMaximizedTabset()
    this.model.visitLayoutNodes(Model.MAIN_LAYOUT_ID, (node) => {
      if (!(node instanceof TabSetNode)) return
      const selected = node.getSelectedNode()
      if (!selected) return
      groups.push({ id: node.getId(), region: 'editor', views: viewIds(node.getTabNodes()), active: selected.getId() as ViewId })
      if (!maximized || maximized === node) visible.push(selected.getId() as ViewId)
    })
    for (const region of EDGE_REGIONS) {
      const border = borderOf(this.model, region)
      if (!border) continue
      const tabs = border.getTabNodes()
      const selected = border.getSelectedNode()
      if (selected) this.lastShown.set(border.getId(), selected.getId() as ViewId)
      // A border is hidden when it is turned off, or when it has tabs and none is open (its tab was clicked again).
      if (!border.isShowing() || (tabs.length > 0 && !selected)) hiddenRegions.push(region)
      else if (selected) visible.push(selected.getId() as ViewId)
      if (tabs.length === 0) continue
      const views = viewIds(tabs)
      const remembered = this.lastShown.get(border.getId())
      groups.push({ id: border.getId(), region, views, active: remembered && views.includes(remembered) ? remembered : views[0]! })
    }
    return { groups, visible, hiddenRegions }
  }

  /** Mirror the model into the store. Called after each change, the user's included (`onModelChange`). */
  sync(): void {
    this.publish(this.snapshot())
  }

  reveal(id: ViewId): void {
    const node = this.model.getNodeById(id)
    if (!(node instanceof TabNode)) return this.add(id)
    const parent = node.getParent()
    if (parent instanceof BorderNode) {
      if (!parent.isShowing()) this.model.doAction(Actions.updateNodeAttributes(parent.getId(), { show: true }))
      // Selecting a border's open tab again would collapse it.
      if (parent.getSelectedNode() !== node) this.model.doAction(Actions.selectTab(id))
    } else if (parent instanceof TabSetNode) {
      const maximized = this.model.getMaximizedTabset()
      if (maximized && maximized !== parent) this.model.doAction(Actions.maximizeToggle(maximized.getId()))
      if (parent.getSelectedNode() !== node || !parent.isActive()) this.model.doAction(Actions.selectTab(id))
    }
    this.sync()
  }

  setRegionVisible(region: RegionId, visible: boolean): void {
    const border = borderOf(this.model, region)
    if (!border) return
    if (!visible) {
      if (border.isShowing()) this.model.doAction(Actions.updateNodeAttributes(border.getId(), { show: false }))
    } else {
      if (!border.isShowing()) this.model.doAction(Actions.updateNodeAttributes(border.getId(), { show: true }))
      const tabs = border.getTabNodes()
      if (tabs.length > 0 && !border.getSelectedNode()) {
        const remembered = this.lastShown.get(border.getId())
        this.model.doAction(Actions.selectTab(tabs.find((tab) => tab.getId() === remembered)?.getId() ?? tabs[0]!.getId()))
      }
    }
    this.sync()
  }

  reset(): void {
    this.onReset()
  }

  /** A view missing from the layout (a stale saved one) goes to its default region. */
  private add(id: ViewId): void {
    const region = defaultRegionOf(id)
    const target = borderOf(this.model, region) ?? this.model.getFirstTabSet()
    if (!target) return
    if (target instanceof BorderNode && !target.isShowing()) this.model.doAction(Actions.updateNodeAttributes(target.getId(), { show: true }))
    this.model.doAction(Actions.addNode(viewTab(id), target.getId(), DockLocation.CENTER, -1, true))
    const added = this.model.getNodeById(id)
    if (target instanceof BorderNode && added instanceof TabNode && target.getSelectedNode() !== added) this.model.doAction(Actions.selectTab(id))
    this.sync()
  }
}
