import { type AutomationSlot, type ControlOwner, automationSlotsOf } from '@core'
import { editAutomationSlot } from '../automation-store'
import { openAutomationSlot } from '../navigation'
import { useStatusStore } from '../status-store'
import { automationSlotClipboard } from './clipboards'
import { project } from './lookup'
import type { Action, SubjectOf } from './types'

type SlotSubject = SubjectOf<'automation-slot'>

const slotOf = ({ owner, scene }: SlotSubject) => automationSlotsOf(project(), owner)?.[scene] ?? null
const exists = (subject: SlotSubject) => !!slotOf(subject)
const playing = (subject: SlotSubject) => {
  const status = useStatusStore.getState().status
  const launcher = subject.owner.kind === 'master' ? status?.masterAutomation : status?.tracks[subject.owner.trackId]
  return !!launcher && launcher.playingClipId === slotOf(subject)?.id
}

/** A copy of a slot for `owner`: fresh slot, lane and point ids, its lanes moved to that owner's controls. */
const slotCopyFor = (slot: AutomationSlot, owner: ControlOwner): AutomationSlot => {
  const automation = slot.automation?.map((lane) => ({ ...lane, id: crypto.randomUUID(), target: { ...lane.target, owner }, points: lane.points.map((point) => ({ ...point, id: crypto.randomUUID() })) }))
  return { ...slot, id: crypto.randomUUID(), ...(automation && { automation }) }
}

/** A cell of the master's or a return's automation column: a slot, or an empty cell that stops the owner's slot. */
export const automationSlotActions: readonly Action<SlotSubject>[] = [
  {
    id: 'automation-slot.launch',
    title: (subject) => (playing(subject) ? 'Stop' : 'Launch'),
    group: 'open',
    applies: exists,
    run: (subject, { engine }) => engine.launchAutomation(subject.owner, playing(subject) ? null : (slotOf(subject)?.id ?? null)),
  },
  {
    id: 'automation-slot.edit',
    title: 'Edit',
    group: 'open',
    applies: exists,
    run: ({ owner, scene }) => openAutomationSlot(owner, scene),
  },
  {
    id: 'automation-slot.create',
    title: 'Create',
    group: 'edit',
    applies: (subject) => !exists(subject),
    run: ({ owner, scene }) => {
      editAutomationSlot(owner, scene, { id: crypto.randomUUID(), name: 'Automation', lengthBeats: 4 })
      openAutomationSlot(owner, scene)
    },
  },
  {
    id: 'automation-slot.copy',
    title: 'Copy',
    group: 'clipboard',
    applies: exists,
    run: (subject) => automationSlotClipboard.set(slotOf(subject)),
  },
  {
    id: 'automation-slot.paste',
    title: 'Paste',
    group: 'clipboard',
    applies: (subject) => !exists(subject),
    enabled: () => !!automationSlotClipboard.get(),
    run: ({ owner, scene }) => {
      const copied = automationSlotClipboard.get()
      if (copied) editAutomationSlot(owner, scene, slotCopyFor(copied, owner))
    },
  },
  {
    id: 'automation-slot.delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    applies: exists,
    run: ({ owner, scene }) => editAutomationSlot(owner, scene, null),
  },
]
