import { DEFAULT_LAYOUT, groupIn, type RegionId, type ViewId } from '@state'
import type { IBorderLocation, IGlobalAttributes, IJsonBorderNode, IJsonModel, IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from 'flexlayout-react'
import { viewMinSizes, viewTitles, viewTooltips } from './view-titles'

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

/**
 * A view's tab. The name, tooltip and minimum size come from the registry, so a saved layout gets the current ones.
 * flexlayout gives a tab group the largest minimum of its tabs, and a sidebar its open tab's.
 */
export const viewTab = (id: ViewId): IJsonTabNode => ({
  type: 'tab',
  id,
  name: viewTitles[id],
  component: 'view',
  minWidth: viewMinSizes[id].width,
  minHeight: viewMinSizes[id].height,
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

/** The built-in layouts, above the named ones. Their ids are stable: commands and keys name them. */
export type LayoutPreset = 'compose' | 'arrange' | 'sound-design' | 'mix'

export const LAYOUT_PRESETS: readonly { readonly id: LayoutPreset; readonly title: string }[] = [
  { id: 'compose', title: 'Compose' },
  { id: 'arrange', title: 'Arrange' },
  { id: 'sound-design', title: 'Sound design' },
  { id: 'mix', title: 'Mix' },
]

/** The tab group the *Sound design* layout splits off the editor area for Instrument. */
export const SOUND_DESIGN_GROUP = 'editor-instrument'

const showing = (group: IJsonTabSetNode, view: ViewId): IJsonTabSetNode => ({ ...group, selected: group.children!.findIndex((tab) => tab.id === view) })
const without = (group: IJsonTabSetNode, view: ViewId): IJsonTabSetNode => ({ ...group, children: group.children!.filter((tab) => tab.id !== view) })

/**
 * A built-in layout, made from the default one, so every view is in it once.
 * * *Compose*: Session in the editor area, the panel on Clip.
 * * *Arrange*: Arrangement in the editor area, the panel on Mixer.
 * * *Sound design*: the editor area split, Instrument (moved from the panel) beside the Wave editor; the panel on
 *   Effects; the secondary sidebar open on Sounds.
 * * *Mix*: Mixer moved to the editor area and showing; the panel collapsed.
 */
export const presetLayout = (id: LayoutPreset): IJsonModel => {
  const json = defaultLayout()
  const column = json.layout.children![0]!
  const [editor, panel] = column.children as [IJsonTabSetNode, IJsonTabSetNode]
  const set = (...children: (IJsonRowNode | IJsonTabSetNode)[]): IJsonModel => ({ ...json, layout: { ...json.layout, children: [{ ...column, children }] } })
  switch (id) {
    case 'compose':
      return set(showing(editor, 'session'), showing(panel, 'clip'))
    case 'arrange':
      return set(showing(editor, 'arrangement'), showing(panel, 'mixer'))
    case 'sound-design': {
      const instrument = panel.children!.find((tab) => tab.id === 'instrument')!
      const split = {
        type: 'row',
        weight: editor.weight,
        children: [
          { ...showing(editor, 'wave'), weight: 50 },
          { type: 'tabset', id: SOUND_DESIGN_GROUP, weight: 50, selected: 0, children: [instrument] },
        ],
      } satisfies IJsonRowNode
      const borders = json.borders!.map((border) =>
        border.location === BORDER_LOCATIONS.secondary
          ? { ...border, show: true, selected: (border.children ?? []).findIndex((tab) => tab.id === 'sounds') }
          : border)
      return { ...set(split, showing(without(panel, 'instrument'), 'effects')), borders }
    }
    case 'mix': {
      const mixer = panel.children!.find((tab) => tab.id === 'mixer')!
      return set(showing({ ...editor, children: [...editor.children!, mixer] }, 'mixer'), { ...without(panel, 'mixer'), maxHeight: 0 })
    }
  }
}
