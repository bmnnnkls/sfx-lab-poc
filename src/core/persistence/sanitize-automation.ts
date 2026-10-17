import { type AutomationLane, type AutomationPoint, MAX_AUTOMATION_LANES, MAX_AUTOMATION_POINTS, canonicalAutomationPoints } from '../automation'
import { controlTargetKey } from '../control'
import { isRecord, type Warn } from './raw'
import { targetOf } from './sanitize-midi-mappings'
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
export const sanitizeAutomation = (raw: unknown, length: number, warn: Warn): readonly AutomationLane[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid automation lanes'); return undefined }
  if (raw.length > MAX_AUTOMATION_LANES) warn('Automation lane limit exceeded')
  const ids = new Set<string>(), targets = new Set<string>(), lanes: AutomationLane[] = []
  for (const lane of raw.slice(0, MAX_AUTOMATION_LANES)) {
    const target = isRecord(lane) ? targetOf(lane.target) : undefined
    if (!isRecord(lane) || !id(lane.id) || ids.has(lane.id) || !target || !Array.isArray(lane.points) || typeof lane.enabled !== 'boolean') { warn('Invalid automation lane skipped'); continue }
    const key = controlTargetKey(target)
    if (targets.has(key)) { warn('Duplicate automation target skipped'); continue }
    ids.add(lane.id); targets.add(key)
    if (lane.points.length > MAX_AUTOMATION_POINTS) warn('Automation point limit exceeded')
    const points: AutomationPoint[] = []
    for (const p of lane.points.slice(0, MAX_AUTOMATION_POINTS)) {
      if (!isRecord(p) || !id(p.id) || !Number.isFinite(p.beat) || !Number.isFinite(p.value) || (p.beat as number) < 0 || (p.beat as number) > length || !['linear', 'hold'].includes(p.interpolation as string)) { warn('Invalid automation point skipped'); continue }
      points.push({ id: p.id, beat: p.beat as number, value: Math.max(0, Math.min(1, p.value as number)), interpolation: p.interpolation as 'linear' | 'hold' })
    }
    lanes.push({ id: lane.id, target, enabled: lane.enabled, points: canonicalAutomationPoints(points, length) })
  }
  return lanes.length ? lanes : undefined
}
