import { selectCanRedo, selectCanUndo, useProjectStore } from '@state'

export const HistoryButtons = () => {
  const canUndo = useProjectStore(selectCanUndo)
  const canRedo = useProjectStore(selectCanRedo)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)

  return (
    <>
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/⌘+Z)" aria-label="Undo">
        ↶
      </button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo">
        ↷
      </button>
    </>
  )
}
