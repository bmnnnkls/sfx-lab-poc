import { DEFAULT_LAYOUT, groupIn, type RegionId, type ViewId } from '@state'
import type { IBorderLocation, IGlobalAttributes, IJsonBorderNode, IJsonModel, IJsonTabNode, IJsonTabSetNode } from 'flexlayout-react'
import { viewTitles, viewTooltips } from './view-titles'

/** The sidebars are flexlayout borders; the editor area and the panel are tab groups in its main layout. */
export const BORDER_LOCATIONS: Readonly<Partial<Record<RegionId, IBorderLocation>>> = {
  primary: 'left',
  secondary: 'right',
}

/** flexlayout names each border by its location. */
export const borderId = (location: IBorderLocation): string => `border_${location}`

/** The id of the editor area's first tab group. */
export const EDITOR_GROUP = 'editor'

/** The panel's tab group. Only the group with this id is the panel; every other tab group is the editor area. */
export const PANEL_GROUP = 'panel'

/** The panel's share of the column it shares with the editor area, out of 100: about 460 px at 1500 × 1000. */
export const DEFAULT_PANEL_WEIGHT = 52

/** The least a sidebar can be dragged to. */
export const MIN_SIDEBAR_SIZE = 180

/** Applies to every layout, saved ones included: tabs can't be closed, renamed, popped out or floated. */
export const GLOBAL_ATTRIBUTES: IGlobalAttributes = {
  tabEnableClose: false,
  tabEnableRename: false,
  tabEnableRenderOnDemand: true,
  // Each view's root is its own scroll container.
  tabEnableScrollbars: false,
  tabSetEnableClose: false,
  // Every tab group has a button that fills the main layout with it, and back (the sidebars stay).
  tabSetEnableMaximize: true,
  borderMinSize: MIN_SIDEBAR_SIZE,
  // A sidebar's width when first opened.
  borderSize: 300,
  // A view dropped into a closed border (an empty sidebar) opens there.
  borderAutoSelectTabWhenClosed: true,
}

/** The panel's own attributes, saved layouts included: it is never deleted, so the toggles always find it. */
export const PANEL_ATTRIBUTES: Partial<IJsonTabSetNode> = { enableDeleteWhenEmpty: false }

/** A view's tab. The name and tooltip come from the registry, so a saved layout gets the current ones. */
export const viewTab = (id: ViewId): IJsonTabNode => ({
  type: 'tab',
  id,
  name: viewTitles[id],
  component: 'view',
  ...(viewTooltips[id] ? { helpText: viewTooltips[id] } : {}),
})

/** A panel height in pixels as the panel's weight, measured against 1000 px (for layouts saved by height). */
export const panelWeightOf = (height: number): number => Math.min(90, Math.max(10, Math.round(height / 10)))

export interface DefaultLayoutOptions {
  /** Which of the editor area's views shows (migrated from `sfxlab:main-view`). */
  readonly editorView?: ViewId
  /** The panel's weight (migrated from `sfxlab:editor-height`). */
  readonly panelWeight?: number
}

/** The layout store's default: the editor area's views over the panel's, the sidebars beside both. */
export const defaultLayout = ({ editorView, panelWeight = DEFAULT_PANEL_WEIGHT }: DefaultLayoutOptions = {}): IJsonModel => {
  const editor = groupIn(DEFAULT_LAYOUT, 'editor')
  const views = editor?.views ?? []
  const editorActive = editorView && views.includes(editorView) ? editorView : editor?.active
  const panel = groupIn(DEFAULT_LAYOUT, 'panel')
  // A hidden sidebar with views starts collapsed to its strip, so its tabs show; an empty one is off.
  const borders = (Object.keys(BORDER_LOCATIONS) as RegionId[]).map((region): IJsonBorderNode => {
    const group = groupIn(DEFAULT_LAYOUT, region)
    const hidden = DEFAULT_LAYOUT.hiddenRegions.includes(region)
    return {
      type: 'border',
      location: BORDER_LOCATIONS[region]!,
      show: !hidden || group !== undefined,
      selected: group && !hidden ? group.views.indexOf(group.active) : -1,
      children: (group?.views ?? []).map(viewTab),
    }
  })
  return {
    global: GLOBAL_ATTRIBUTES,
    borders,
    layout: {
      type: 'row',
      // The root row is horizontal, so the column inside it stacks the editor area over the panel.
      children: [{
        type: 'row',
        children: [
          {
            type: 'tabset',
            id: EDITOR_GROUP,
            weight: 100 - panelWeight,
            selected: editorActive ? Math.max(0, views.indexOf(editorActive)) : 0,
            children: views.map(viewTab),
          },
          {
            type: 'tabset',
            id: PANEL_GROUP,
            weight: panelWeight,
            ...PANEL_ATTRIBUTES,
            selected: panel ? Math.max(0, panel.views.indexOf(panel.active)) : -1,
            ...(DEFAULT_LAYOUT.hiddenRegions.includes('panel') ? { maxHeight: 0 } : {}),
            children: (panel?.views ?? []).map(viewTab),
          },
        ],
      }],
    },
  }
}

/** Where a view sits in the default layout, and so where it goes when a layout is missing it. */
export const defaultRegionOf = (id: ViewId): RegionId =>
  DEFAULT_LAYOUT.groups.find((group) => group.views.includes(id))?.region ?? 'editor'
