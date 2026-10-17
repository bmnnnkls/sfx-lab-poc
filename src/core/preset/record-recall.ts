import { automationPosition, canonicalAutomationPoints, MAX_AUTOMATION_POINTS, type AutomationLane } from '../automation'
import { createId } from '../shared'
/** A recall is a step which lasts until the next authored point (or the loop end). */
export const stepRecallLane = (lane: AutomationLane, beat: number, value: number, length: number, base: number): AutomationLane => {
  const local = ((beat % length) + length) % length, edge = 1e-7
  const before = Math.max(0, local - edge)
  const points = [...lane.points.filter(p => p.beat < before || p.beat > local),
    ...(local > 0 ? [{ id: createId('point'), beat: before, value: automationPosition({ ...lane, enabled: true }, before) ?? base, interpolation: 'hold' as const }] : []),
    { id: createId('point'), beat: local, value, interpolation: 'hold' as const }]
  if (points.length > MAX_AUTOMATION_POINTS) throw new Error('Recall exceeds automation point limit')
  return { ...lane, enabled: true, points: canonicalAutomationPoints(points, length) }
}
