import {
  MASTER_IN_TYPE,
  RETURN_IN_TYPE,
  SEND_TYPE,
  TRACK_AUDIO_TYPE,
  TRACK_IN_TYPE,
  type Track,
  type TrackGraph,
  noteNodeDefinitions,
  nodeDefinitions,
} from '@core'

/** Where an insert graph starts: a return track at Return in, the master at Master in, every other track at Track in. */
const START: Record<Track['kind'] | 'master', string> = {
  instrument: TRACK_IN_TYPE,
  audio: TRACK_IN_TYPE,
  return: RETURN_IN_TYPE,
  master: MASTER_IN_TYPE,
}
const STARTS = new Set(Object.values(START))

/** What each kind of graph may offer in its palette: the insert graph has its own ends and no note-driven sources. */
export const paletteFor = (graph: TrackGraph, kind: Track['kind'] | 'master') => {
  // A note graph also takes controls and math: they work out constants that drive the note nodes' parameters.
  if (graph === 'notes') return [...noteNodeDefinitions, ...nodeDefinitions.filter((definition) => definition.inNotes === true)]
  return nodeDefinitions.filter((definition) => {
    if (graph !== 'fx') return definition.insertOnly !== true
    if (STARTS.has(definition.type)) return definition.type === START[kind]
    // The master graph runs on the whole block, after the tracks: nothing to send to, and no tracks to read one by one.
    if (kind === 'master' && (definition.type === SEND_TYPE || definition.type === TRACK_AUDIO_TYPE)) return false
    return definition.type !== 'note' && definition.type !== 'output' && definition.usesSample !== true
  })
}

