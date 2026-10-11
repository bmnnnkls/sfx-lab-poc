import { delayNode } from './nodes/delay.node'
import { envelopeNode } from './nodes/envelope.node'
import { filterNode } from './nodes/filter.node'
import { gainNode } from './nodes/gain.node'
import { lfoNode } from './nodes/lfo.node'
import { noteNode } from './nodes/note.node'
import { oscillatorNode } from './nodes/oscillator.node'
import { monoSumNode } from './nodes/mono-sum.node'
import { outputNode } from './nodes/output.node'
import { panNode } from './nodes/pan.node'
import { pingPongNode } from './nodes/ping-pong.node'
import { returnInNode } from './nodes/return-in.node'
import { reverbNode } from './nodes/reverb.node'
import { sendNode } from './nodes/send.node'
import { samplerNode } from './nodes/sampler.node'
import { stereoReverbNode } from './nodes/stereo-reverb.node'
import { trackInNode } from './nodes/track-in.node'
import { trackOutNode } from './nodes/track-out.node'
import { widthNode } from './nodes/width.node'
import type { NodeDefinition } from './types'

export const nodeDefinitions: readonly NodeDefinition[] = [
  noteNode,
  oscillatorNode,
  samplerNode,
  envelopeNode,
  gainNode,
  filterNode,
  lfoNode,
  delayNode,
  reverbNode,
  outputNode,
  trackInNode,
  trackOutNode,
  panNode,
  widthNode,
  stereoReverbNode,
  pingPongNode,
  monoSumNode,
  returnInNode,
  sendNode,
]

const byType = new Map(nodeDefinitions.map((definition) => [definition.type, definition]))

export const findNodeDefinition = (type: string): NodeDefinition | undefined => byType.get(type)

export const requireNodeDefinition = (type: string): NodeDefinition => {
  const definition = byType.get(type)
  if (!definition) throw new Error(`Unknown node type: ${type}`)
  return definition
}
