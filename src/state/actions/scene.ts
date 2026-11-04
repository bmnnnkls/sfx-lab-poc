import { MAX_SCENES } from '@core'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type SceneSubject = SubjectOf<'scene'>

/** The automation scene follows its row when rows above it come or go, and resets when its own row goes. */
const shiftAutomationScene = (at: number, by: 1 | -1) => {
  const selection = useSelectionStore.getState()
  const scene = selection.automationScene
  const next = by === -1 && scene === at ? 0 : scene >= at ? scene + by : scene
  if (next !== scene) useSelectionStore.setState({ automationScene: next })
}

const roomForOne = () => project().sceneCount < MAX_SCENES

/** A row of the session grid. */
export const sceneActions: readonly Action<SceneSubject>[] = [
  { id: 'scene.launch', title: 'Launch', group: 'open', run: ({ scene }, { engine }) => engine.launchScene(scene) },
  renameAction('scene'),
  {
    id: 'scene.insert',
    title: 'Insert scene before',
    group: 'edit',
    enabled: roomForOne,
    run: ({ scene }) => {
      useProjectStore.getState().insertScene(scene)
      shiftAutomationScene(scene, 1)
    },
  },
  {
    id: 'scene.duplicate',
    verb: 'duplicate',
    title: 'Duplicate',
    group: 'edit',
    enabled: roomForOne,
    run: ({ scene }) => {
      useProjectStore.getState().duplicateScene(scene)
      shiftAutomationScene(scene + 1, 1)
    },
  },
  {
    id: 'scene.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    enabled: () => project().sceneCount > 1,
    run: ({ scene }) => {
      useProjectStore.getState().removeScene(scene)
      shiftAutomationScene(scene, -1)
    },
  },
]
