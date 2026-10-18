import type { ControlOwner } from '../control'
import type { AutomationSlot } from '../project'
import { clamp } from '../shared'
import { LIMITS } from './format'
import { asList, finiteNumber, isRecord, nonEmptyText, type Warn } from './raw'
import { sanitizeAutomation } from './sanitize-automation'

export const sanitizeAutomationSlots = (raw: unknown, scenes: number, owner: ControlOwner, warn: Warn): readonly (AutomationSlot | null)[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid automation slots'); return undefined }
  if (raw.length > scenes) warn('Extra automation slots dropped')
  const ids = new Set<string>()
  return Array.from({ length: scenes }, (_, scene) => {
    const slot = asList(raw)[scene]
    if (slot === null || slot === undefined) return null
    if (!isRecord(slot) || typeof slot.id !== 'string' || !slot.id.length || slot.id.length > 256 || ids.has(slot.id)) { warn('Invalid automation slot skipped'); return null }
    ids.add(slot.id)
    const lengthBeats = clamp(finiteNumber(slot.lengthBeats, 4), LIMITS.clipBeats.min, LIMITS.clipBeats.max)
    const automation = sanitizeAutomation(slot.automation, lengthBeats, warn, owner)
    return { id: slot.id, name: nonEmptyText(slot.name, 'Automation', 40), lengthBeats, ...(automation && { automation }) }
  })
}
