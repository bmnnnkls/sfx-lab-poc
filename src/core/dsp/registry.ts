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
import { masterInNode, returnInNode } from './nodes/return-in.node'
import { reverbNode } from './nodes/reverb.node'
import { sendNode } from './nodes/send.node'
import { samplerNode } from './nodes/sampler.node'
import { stereoReverbNode } from './nodes/stereo-reverb.node'
import { trackAudioNode } from './nodes/track-audio.node'
import { trackInNode } from './nodes/track-in.node'
import { trackOutNode } from './nodes/track-out.node'
import { widthNode } from './nodes/width.node'
import { controlNode } from './nodes/control.node'
import { addNode, clampNode, compareNode, invertNode, maxNode, minNode, multiplyNode } from './nodes/math/arithmetic'
import { hzToMidiNode, midiToHzNode } from './nodes/math/midi'
import { mapRangeNode, mixNode, quantizeNode } from './nodes/math/shaping'
import { smoothNode } from './nodes/math/smooth.node'
import { switchNode } from './nodes/switch.node'
import { xyPadNode } from './nodes/xy-pad.node'
import { documented } from './document'
import { nodeDocs } from './node-docs'
import type { NodeDefinition } from './types'

const plainDefinitions: readonly NodeDefinition[] = [
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
  masterInNode,
  sendNode,
  trackAudioNode,
  controlNode,
  xyPadNode,
  switchNode,
  addNode,
  multiplyNode,
  invertNode,
  minNode,
  maxNode,
  clampNode,
  mapRangeNode,
  quantizeNode,
  smoothNode,
  mixNode,
  compareNode,
  midiToHzNode,
  hzToMidiNode,
]

/** Every node type, with the words that go with it (`node-docs.ts`) attached. */
export const nodeDefinitions: readonly NodeDefinition[] = plainDefinitions.map((definition) => documented(definition, nodeDocs[definition.type]))

const byType = new Map(nodeDefinitions.map((definition) => [definition.type, definition]))

export const findNodeDefinition = (type: string): NodeDefinition | undefined => byType.get(type)

export const requireNodeDefinition = (type: string): NodeDefinition => {
  const definition = byType.get(type)
  if (!definition) throw new Error(`Unknown node type: ${type}`)
  return definition
}
