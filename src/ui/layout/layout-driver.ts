import type { GroupState, LayoutDriver, LayoutSnapshot, RegionId, ViewId } from '@state'
import { type Action, Actions, BorderNode, DockLocation, Model, type Node, Orientation, RowNode, TabNode, TabSetNode } from 'flexlayout-react'
import { BORDER_LOCATIONS, borderId, defaultRegionOf, PANEL_GROUP, viewTab } from './default-layout'

const borderOf = (model: Model, region: RegionId): BorderNode | undefined => {
  const location = BORDER_LOCATIONS[region]
  const node = location && model.getNodeById(borderId(location))
  return node instanceof BorderNode ? node : undefined
}

const SIDEBARS = Object.keys(BORDER_LOCATIONS) as RegionId[]

const viewIds = (tabs: readonly TabNode[]): ViewId[] => tabs.map((tab) => tab.getId() as ViewId)

/** The tab groups under a node, itself included. */
const tabSetsIn = (node: Node): TabSetNode[] =>
  node instanceof TabSetNode ? [node] : node.getChildren().flatMap(tabSetsIn)

/** What the driver leaves to the shell, which owns the model's lifetime and storage. */
export interface LayoutShell {
  /** Replace the model with the default layout. */
  reset(): void
  /** Replace the model with the layout saved under this name. */
  load(name: string): void
  /** Save the current model under this name. */
  saveAs(name: string): void
}

/**
 * The shell's side of the layout store's façade: it carries out the store's actions on flexlayout's model and
 * mirrors the model back as a `LayoutSnapshot`. One per model; *Reset layout* and loading a named layout make a new model.
 *
 * The panel is the tab group with id `panel`. It collapses to its tab strip with `maxHeight: 0` (flexlayout adds the
 * strip to a group's maximum), and keeps its weight while collapsed, so expanding brings back its height.
 */
export class FlexLayoutDriver implements LayoutDriver {
  /** The tab each border showed last, so showing a collapsed border brings that tab back. */
  private readonly lastShown = new Map<string, ViewId>()

  constructor(
    readonly model: Model,
    private readonly publish: (snapshot: LayoutSnapshot) => void,
    private readonly shell: LayoutShell,
  ) {}

  /** What the store mirrors. Computed from the model, not from flexlayout's visibility events, so it is current. */
  snapshot(): LayoutSnapshot {
    const groups: GroupState[] = []
    const visible: ViewId[] = []
    const hiddenRegions: RegionId[] = []
    const maximized = this.model.getMaximizedTabset()
    const squeezed = this.squeezed()
    this.model.visitLayoutNodes(Model.MAIN_LAYOUT_ID, (node) => {
      if (!(node instanceof TabSetNode)) return
      const selected = node.getSelectedNode()
      if (!selected) return
      groups.push({ id: node.getId(), region: node.getId() === PANEL_GROUP ? 'panel' : 'editor', views: viewIds(node.getTabNodes()), active: selected.getId() as ViewId })
      if ((!maximized || maximized === node) && !squeezed.includes(node)) visible.push(selected.getId() as ViewId)
    })
    // The panel is hidden while collapsed, and while another group fills the layout.
    if (this.isCollapsed() || (maximized && maximized !== this.panel())) hiddenRegions.push('panel')
    for (const region of SIDEBARS) {
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

  /**
   * Adjusts the user's actions before flexlayout applies them (its `onAction`).
   * * Dragging a border's open tab away would leave the border collapsed; the border shows the neighbouring tab
   *   instead, as the panel does.
   * * Selecting a tab in a collapsed panel, or dropping a tab into it, expands it.
   * * A splitter dragged while the panel is collapsed leaves the panel's weight alone, so it expands to its height.
   * * Maximizing a collapsed panel expands it first: a maximized group keeps its maximum height.
   */
  intercept(action: Action): Action {
    if (action.type === Actions.MAXIMIZE_TOGGLE) {
      const node = this.model.getNodeById(action.data.node as string)
      return node instanceof TabSetNode && this.squeezed().includes(node) ? Actions.group([this.expandAction(), action]) : action
    }
    if (action.type === Actions.SELECT_TAB) {
      const node = this.model.getNodeById(action.data.tabNode as string)
      const parent = node?.getParent()
      return parent instanceof TabSetNode && this.squeezed().includes(parent) ? Actions.group([action, this.expandAction()]) : action
    }
    if (action.type === Actions.ADJUST_WEIGHTS) return this.keepPanelWeight(action)
    if (action.type !== Actions.MOVE_NODE) return action
    if (action.data.toNode === PANEL_GROUP && this.isCollapsed()) return Actions.group([action, this.expandAction()])
    const node = this.model.getNodeById(action.data.fromNode as string)
    const border = node?.getParent()
    if (!(node instanceof TabNode) || !(border instanceof BorderNode) || border.getSelectedNode() !== node) return action
    if (action.data.toNode === border.getId()) return action
    const tabs = border.getTabNodes()
    const index = tabs.indexOf(node)
    const neighbour = tabs[index + 1] ?? tabs[index - 1]
    return neighbour ? Actions.group([action, Actions.selectTab(neighbour.getId())]) : action
  }

  /**
   * A click on a tab, before flexlayout handles it. flexlayout ignores clicks on a group's open tab; on the panel's,
   * the click collapses the panel, as it does a sidebar, and on any open tab in a collapsed panel it expands it.
   */
  clickTab(id: ViewId): void {
    const node = this.model.getNodeById(id)
    const parent = node?.getParent()
    if (!(node instanceof TabNode) || !(parent instanceof TabSetNode) || parent.getSelectedNode() !== node) return
    if (this.squeezed().includes(parent)) this.setRegionVisible('panel', true)
    else if (parent.getId() === PANEL_GROUP) this.setRegionVisible('panel', false)
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
      if (this.squeezed().includes(parent)) this.model.doAction(this.expandAction())
      if (parent.getSelectedNode() !== node || !parent.isActive()) this.model.doAction(Actions.selectTab(id))
    }
    this.sync()
  }

  setRegionVisible(region: RegionId, visible: boolean): void {
    if (region === 'panel') {
      // Showing the panel restores a group that fills the layout; hiding a maximized panel restores the others.
      const maximized = this.model.getMaximizedTabset()
      if (maximized && (maximized === this.panel()) !== visible) this.model.doAction(Actions.maximizeToggle(maximized.getId()))
      if (visible && this.isCollapsed()) this.model.doAction(this.expandAction())
      if (!visible && !this.isCollapsed() && this.band()) this.model.doAction(Actions.updateNodeAttributes(PANEL_GROUP, { maxHeight: 0 }))
      return this.sync()
    }
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
    this.shell.reset()
  }

  load(name: string): void {
    this.shell.load(name)
  }

  saveAs(name: string): void {
    this.shell.saveAs(name)
  }

  private panel(): TabSetNode | undefined {
    const node = this.model.getNodeById(PANEL_GROUP)
    return node instanceof TabSetNode ? node : undefined
  }

  private isCollapsed(): boolean {
    return this.panel()?.getAttrMaxHeight() === 0
  }

  private expandAction(): Action {
    return Actions.updateNodeAttributes(PANEL_GROUP, { maxHeight: undefined })
  }

  /**
   * What collapses with the panel: the panel itself, or, when it is split sideways, the row it shares with the groups
   * beside it (a row is only as tall as its shortest member). Undefined when nothing sits above or below it to take
   * the height, since collapsing would then shrink the whole layout.
   */
  private band(): TabSetNode | RowNode | undefined {
    let node: TabSetNode | RowNode | undefined = this.panel()
    while (node) {
      const parent: Node | undefined = node.getParent()
      if (!(parent instanceof RowNode)) return undefined
      if (parent.getOrientation() === Orientation.VERT) return node
      node = parent
    }
    return undefined
  }

  /** The tab groups shrunk to their strips by a collapsed panel. */
  private squeezed(): TabSetNode[] {
    const band = this.isCollapsed() ? this.band() : undefined
    return band ? tabSetsIn(band) : []
  }

  /** While the panel is collapsed, a splitter drag in its column keeps the panel's share and rescales the others. */
  private keepPanelWeight(action: Action): Action {
    const band = this.isCollapsed() ? this.band() : undefined
    const row = band?.getParent()
    if (!band || !row || action.data.nodeId !== row.getId()) return action
    const children = row.getChildren()
    const index = children.indexOf(band)
    const weights = action.data.weights as number[]
    const othersBefore = children.reduce((sum, child, i) => (i === index ? sum : sum + (child as RowNode | TabSetNode).getWeight()), 0)
    const othersAfter = weights.reduce((sum, weight, i) => (i === index ? sum : sum + weight), 0)
    if (othersAfter <= 0) return action
    return Actions.adjustWeights(row.getId(), weights.map((weight, i) => (i === index ? band.getWeight() : weight * othersBefore / othersAfter)))
  }

  /** A view missing from the layout (a stale saved one) goes to its default region. */
  private add(id: ViewId): void {
    const region = defaultRegionOf(id)
    const panel = this.panel()
    const firstEditor = (): TabSetNode | undefined => {
      let found: TabSetNode | undefined
      this.model.visitLayoutNodes(Model.MAIN_LAYOUT_ID, (node) => {
        if (!found && node instanceof TabSetNode && node !== panel) found = node
      })
      return found
    }
    const target = borderOf(this.model, region) ?? (region === 'panel' ? panel : firstEditor()) ?? this.model.getFirstTabSet()
    if (!target) return
    if (target instanceof BorderNode && !target.isShowing()) this.model.doAction(Actions.updateNodeAttributes(target.getId(), { show: true }))
    if (target === panel && this.isCollapsed()) this.model.doAction(this.expandAction())
    this.model.doAction(Actions.addNode(viewTab(id), target.getId(), DockLocation.CENTER, -1, true))
    const added = this.model.getNodeById(id)
    if (target instanceof BorderNode && added instanceof TabNode && target.getSelectedNode() !== added) this.model.doAction(Actions.selectTab(id))
    this.sync()
  }
}
