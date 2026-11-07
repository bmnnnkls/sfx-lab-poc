import { selectCanRedo, selectCanUndo, useProjectStore } from '@state'
import { useKeyLabel, withKey } from '../commands/CommandHost'
import { Icon } from '../shared/icon'

export const HistoryButtons = () => {
  const canUndo = useProjectStore(selectCanUndo)
  const canRedo = useProjectStore(selectCanRedo)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const undoKey = useKeyLabel('history.undo')
  const redoKey = useKeyLabel('history.redo')

  return (
    <>
      <button onClick={undo} disabled={!canUndo} title={withKey('Undo', undoKey)} aria-label="Undo">
        <Icon name="undo" />
      </button>
      <button onClick={redo} disabled={!canRedo} title={withKey('Redo', redoKey)} aria-label="Redo">
        <Icon name="redo" />
      </button>
    </>
  )
}
