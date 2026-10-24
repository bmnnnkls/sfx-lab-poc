import { DEFAULT_LAYOUT, groupIn, type RegionId, type ViewId } from '@state'
import type { IBorderLocation, IGlobalAttributes, IJsonBorderNode, IJsonModel, IJsonTabNode } from 'flexlayout-react'
import { viewTitles, viewTooltips } from './view-titles'

/** The edge regions are flexlayout borders; the editor area is its main row of tab groups. */
export const BORDER_REGIONS: Readonly<Record<IBorderLocation, RegionId | undefined>> = {
  bottom: 'panel',
  left: 'primary',
  right: 'secondary',
  top: undefined,
}

export const BORDER_LOCATIONS: Readonly<Partial<Record<RegionId, IBorderLocation>>> = {
  panel: 'bottom',
  primary: 'left',
  secondary: 'right',
}

/** flexlayout names each border by its location. */
export const borderId = (location: IBorderLocation): string => `border_${location}`

/** The id of the editor area's first tab group. */
export const EDITOR_GROUP = 'editor'

/** The panel's height when nothing else says, and the least it can be dragged to. */
export const DEFAULT_PANEL_SIZE = 460
export const MIN_PANEL_SIZE = 180

/** Applies to every layout, saved ones included: tabs can't be closed, renamed, popped out or floated. */
export const GLOBAL_ATTRIBUTES: IGlobalAttributes = {
  tabEnableClose: false,
  tabEnableRename: false,
  tabEnableRenderOnDemand: true,
  // Each view's root is its own scroll container.
  tabEnableScrollbars: false,
  tabSetEnableClose: false,
  borderMinSize: MIN_PANEL_SIZE,
  borderSize: DEFAULT_PANEL_SIZE,
}

/** A view's tab. The name and tooltip come from the registry, so a saved layout gets the current ones. */
export const viewTab = (id: ViewId): IJsonTabNode => ({
  type: 'tab',
  id,
  name: viewTitles[id],
  component: 'view',
  ...(viewTooltips[id] ? { helpText: viewTooltips[id] } : {}),
})

export interface DefaultLayoutOptions {
  /** Which of the editor area's views shows (migrated from `sfxlab:main-view`). */
  readonly editorView?: ViewId
  /** The panel's height (migrated from `sfxlab:editor-height`). */
  readonly panelSize?: number
}

/** Today's layout, from the layout store's default: Session and Arrangement over the tool views in the panel. */
export const defaultLayout = ({ editorView, panelSize = DEFAULT_PANEL_SIZE }: DefaultLayoutOptions = {}): IJsonModel => {
  const editor = groupIn(DEFAULT_LAYOUT, 'editor')
  const views = editor?.views ?? []
  const editorActive = editorView && views.includes(editorView) ? editorView : editor?.active
  const borders = (Object.keys(BORDER_LOCATIONS) as RegionId[]).map((region): IJsonBorderNode => {
    const location = BORDER_LOCATIONS[region]!
    const group = groupIn(DEFAULT_LAYOUT, region)
    return {
      type: 'border',
      location,
      show: !DEFAULT_LAYOUT.hiddenRegions.includes(region),
      selected: group ? group.views.indexOf(group.active) : -1,
      ...(region === 'panel' ? { size: panelSize } : {}),
      children: (group?.views ?? []).map(viewTab),
    }
  })
  return {
    global: GLOBAL_ATTRIBUTES,
    borders,
    layout: {
      type: 'row',
      children: [{
        type: 'tabset',
        id: EDITOR_GROUP,
        selected: editorActive ? Math.max(0, views.indexOf(editorActive)) : 0,
        children: views.map(viewTab),
      }],
    },
  }
}

/** Where a view sits in the default layout, and so where it goes when a layout is missing it. */
export const defaultRegionOf = (id: ViewId): RegionId =>
  DEFAULT_LAYOUT.groups.find((group) => group.views.includes(id))?.region ?? 'editor'
