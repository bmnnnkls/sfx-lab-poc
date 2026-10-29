import { exampleProjects } from '@core'
import { type Verb, verbTarget, runVerb } from '../actions'
import { type RegionId, type ViewId, useLayoutStore } from '../layout-store'
import { usePersistenceStore } from '../persistence-store'
import { selectCanRedo, selectCanUndo, useProjectStore } from '../project-store'
import { useStatusStore } from '../status-store'
import { useTouchStore } from '../touch-store'
import type { Command } from './types'

/** The regions that can be hidden, by name: their toggles, the menus and the commands use these. */
export const REGION_NAMES: Readonly<Record<Exclude<RegionId, 'editor'>, string>> = {
  primary: 'Primary sidebar',
  panel: 'Panel',
  secondary: 'Secondary sidebar',
}

/** *Show Session*, … one per view. The titles are `ui`'s, so a new view without one is a type error there. */
export const viewCommands = (titles: Readonly<Record<ViewId, string>>): readonly Command[] =>
  (Object.keys(titles) as ViewId[]).map((view) => ({
    id: `view.show.${view}`,
    category: 'View',
    title: `Show ${titles[view]}`,
    run: () => useLayoutStore.getState().revealView(view),
  }))

const regionToggle = (region: Exclude<RegionId, 'editor'>): Command => ({
  id: `layout.toggle.${region}`,
  category: 'Layout',
  title: `Toggle ${REGION_NAMES[region].toLowerCase()}`,
  label: () => `${useLayoutStore.getState().hiddenRegions.includes(region) ? 'Show' : 'Hide'} ${REGION_NAMES[region].toLowerCase()}`,
  run: () => useLayoutStore.getState().toggleRegion(region),
})

const STARTER = 'starter'

const VERB_TITLES: Readonly<Record<Verb, string>> = {
  delete: 'Delete',
  duplicate: 'Duplicate',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  rename: 'Rename',
}

/** An edit key: the focused thing's action with that verb. Without one it doesn't apply, and the key is the browser's. */
const verbCommand = (verb: Verb): Command => ({
  id: `edit.${verb}`,
  category: 'Edit',
  title: VERB_TITLES[verb],
  palette: false,
  applies: (context) => verbTarget(verb, context.focus, context) !== undefined,
  run: (context) => {
    runVerb(verb, context.focus, context)
  },
})

/** The commands that need only `state`. `ui/commands` adds the ones that open dialogs, move the focus or read named layouts. */
export const STATE_COMMANDS: readonly Command[] = [
  { id: 'view.toggle-main', category: 'View', title: 'Switch Session and Arrangement', run: () => useLayoutStore.getState().toggleMainView() },
  regionToggle('primary'),
  regionToggle('panel'),
  regionToggle('secondary'),
  {
    id: 'layout.maximize',
    category: 'Layout',
    title: 'Maximize or restore group',
    run: (context) => useLayoutStore.getState().toggleMaximize(context.origin ?? undefined),
  },
  { id: 'layout.reset', category: 'Layout', title: 'Reset layout', run: () => useLayoutStore.getState().resetLayout() },
  { id: 'file.export', category: 'File', title: 'Export to file…', run: ({ files }) => files.exportProject() },
  { id: 'file.import', category: 'File', title: 'Import from file…', run: ({ files }) => files.importProject() },
  { id: 'file.new', category: 'File', title: 'New project', run: ({ files }) => files.newProject() },
  {
    id: 'file.open-example',
    category: 'File',
    title: 'Open example',
    choices: () => [
      ...exampleProjects.map((example) => ({ id: example.id, title: example.title, tooltip: example.tagline })),
      { id: STARTER, title: 'Starter', tooltip: 'Three plain tracks to start from' },
    ],
    run: ({ files }, choice) => {
      if (choice === STARTER) files.loadDemo()
      else if (choice) files.loadExample(choice)
    },
  },
  {
    id: 'file.restore-previous',
    category: 'File',
    title: 'Restore previous',
    tooltip: 'Swap back to the project you most recently replaced',
    enabled: () => usePersistenceStore.getState().hasBackup,
    run: ({ files }) => files.restorePrevious(),
  },
  {
    id: 'transport.play-stop',
    category: 'Transport',
    title: 'Play or stop',
    run: ({ engine }) => (useStatusStore.getState().status?.playing ? engine.stop() : engine.play()),
  },
  { id: 'transport.play', category: 'Transport', title: 'Play', run: ({ engine }) => engine.play() },
  { id: 'transport.stop', category: 'Transport', title: 'Stop', run: ({ engine }) => engine.stop() },
  {
    id: 'transport.touch',
    category: 'Transport',
    title: 'Arm Touch automation',
    label: () => (useTouchStore.getState().armed ? 'Disarm Touch automation' : 'Arm Touch automation'),
    tooltip: "Record controls into each owner's playing clip or automation slot",
    run: () => useTouchStore.getState().arm(!useTouchStore.getState().armed),
  },
  { id: 'history.undo', category: 'Edit', title: 'Undo', repeat: true, enabled: () => selectCanUndo(useProjectStore.getState()), run: () => useProjectStore.getState().undo() },
  { id: 'history.redo', category: 'Edit', title: 'Redo', repeat: true, enabled: () => selectCanRedo(useProjectStore.getState()), run: () => useProjectStore.getState().redo() },
  { id: 'track.add-instrument', category: 'Track', title: 'Add instrument track', run: () => useProjectStore.getState().addTrack() },
  { id: 'track.add-audio', category: 'Track', title: 'Add audio track', run: () => useProjectStore.getState().addAudioTrack() },
  { id: 'track.add-return', category: 'Track', title: 'Add return track', run: () => useProjectStore.getState().addReturnTrack() },
  verbCommand('delete'),
  verbCommand('duplicate'),
  verbCommand('copy'),
  verbCommand('cut'),
  verbCommand('paste'),
  verbCommand('rename'),
]
