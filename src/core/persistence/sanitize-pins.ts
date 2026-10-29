import { MAX_PINS, type PanelPin, type Project, type TrackGraph, pinKey, pinnedGraph } from '../project'
import { LIMITS } from './format'
import { type Warn, asList, isRecord } from './raw'
import { readControlOwner } from './sanitize-control-values'

const GRAPHS: readonly TrackGraph[] = ['patch', 'fx', 'notes']

/**
 * Reads `pins` against the project read so far. A malformed entry (an owner that isn't one, a graph that isn't one, or
 * one a group or the master doesn't have), a repeated key, and anything past `MAX_PINS` go with a warning. A pin whose
 * graph is missing goes silently: a project saved with a pin of a removed track is normal. `collapsed` counts only as
 * a real `true`. Undefined when no pin is left.
 */
export const sanitizePins = (raw: unknown, project: Project, warn: Warn): readonly PanelPin[] | undefined => {
  const pins: PanelPin[] = []
  const keys = new Set<string>()
  let over = false
  for (const [index, entry] of asList(raw).entries()) {
    const where = `Pinned panel ${index + 1}`
    const owner = isRecord(entry) ? readControlOwner(entry.owner) : undefined
    const graph = isRecord(entry) && GRAPHS.includes(entry.graph as TrackGraph) ? (entry.graph as TrackGraph) : undefined
    if (!isRecord(entry) || !owner || !graph || (owner.kind !== 'track' && graph !== 'fx')) {
      warn(`${where}: dropped a pin that names no graph`)
      continue
    }
    const pin: PanelPin = { owner, graph, ...(entry.collapsed === true && { collapsed: true }) }
    if (keys.has(pinKey(pin))) {
      warn(`${where}: dropped a second pin of the same panel`)
      continue
    }
    if (!pinnedGraph(project, pin)) continue
    if (pins.length === LIMITS.pins) {
      over = true
      continue
    }
    keys.add(pinKey(pin))
    pins.push(pin)
  }
  if (over) warn(`Only the first ${MAX_PINS} pinned panels were kept`)
  return pins.length > 0 ? pins : undefined
}
