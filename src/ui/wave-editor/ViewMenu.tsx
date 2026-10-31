import { type Subject, useWaveEditSettings } from '@state'
import { type MenuEntry, PopupMenu, useActionContext, useActionEntries } from '../shared/menu'
import type { RulerMode, RulerTempo } from './ruler-ticks'

const ZOOMS = new Set(['sample-selection.zoom-selection', 'sample-selection.zoom-fit'])

/**
 * *View ▾*: the zooms (the subject's actions, as in the right-click menu), the ruler's mode, the tempo its beats count
 * at, and the two snaps, each checked when in effect.
 */
export const ViewMenu = ({
  subject,
  ruler,
  onRuler,
  tempo,
  onTempo,
  projectTempo,
  sampleTempo,
}: {
  subject: Subject
  ruler: RulerMode
  onRuler(mode: RulerMode): void
  tempo: RulerTempo
  onTempo(tempo: RulerTempo): void
  projectTempo: number
  sampleTempo: number | null
}) => {
  const context = useActionContext()
  const snap = useWaveEditSettings((state) => state.snap)
  const fromName = tempo === 'sample' && sampleTempo !== null
  const settings: readonly MenuEntry[] = [
    { kind: 'separator' },
    { label: 'Time', checked: ruler === 'time', tooltip: 'The ruler counts minutes and seconds', onSelect: () => onRuler('time') },
    { label: 'Beats', checked: ruler === 'beats', tooltip: 'The ruler counts bars and beats', onSelect: () => onRuler('beats') },
    { kind: 'separator' },
    { label: `Project tempo (${projectTempo} BPM)`, checked: !fromName, disabled: ruler !== 'beats', tooltip: 'Count beats at the project tempo', onSelect: () => onTempo('project') },
    {
      label: sampleTempo === null ? 'Tempo from the name' : `Tempo from the name (${sampleTempo} BPM)`,
      checked: fromName,
      disabled: ruler !== 'beats' || sampleTempo === null,
      tooltip: sampleTempo === null ? 'The sample has no tempo in its name' : 'Count beats at the tempo in the sample name',
      onSelect: () => onTempo('sample'),
    },
    { kind: 'separator' },
    {
      label: 'Snap to beats',
      checked: snap.beats,
      disabled: ruler !== 'beats',
      tooltip: ruler === 'beats' ? 'Clicks and drags snap to the beat lines, and to markers, regions and the loop; hold Alt not to' : 'The ruler counts time: switch it to beats',
      onSelect: () => useWaveEditSettings.getState().setSnap({ beats: !snap.beats }),
    },
    {
      label: 'Snap to zero crossings',
      checked: snap.zero,
      tooltip: 'Clicks and drags snap to where the waveform crosses zero, and to markers, regions and the loop; hold Alt not to',
      onSelect: () => useWaveEditSettings.getState().setSnap({ zero: !snap.zero }),
    },
  ]
  return (
    <PopupMenu entries={() => [...useActionEntries(subject, context, (item) => ZOOMS.has(item.id)), ...settings]}>
      <button aria-label="View" title="Zoom, and what the ruler counts">
        View ▾
      </button>
    </PopupMenu>
  )
}
