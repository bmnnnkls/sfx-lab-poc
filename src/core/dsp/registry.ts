import { followerNode } from './nodes/analysis/follower.node'
import { levelNode } from './nodes/analysis/level.node'
import { pitchNode } from './nodes/analysis/pitch.node'
import { delayNode } from './nodes/delay.node'
import { envelopeNode } from './nodes/envelope.node'
import { filterNode } from './nodes/filter.node'
import { gainNode } from './nodes/gain.node'
import { geigerNode } from './nodes/geiger.node'
import { lfoNode } from './nodes/lfo.node'
import { noiseNode } from './nodes/noise.node'
import { noteNode } from './nodes/note.node'
import { oscillatorNode } from './nodes/oscillator.node'
import { monoSumNode } from './nodes/mono-sum.node'
import { outputNode } from './nodes/output.node'
import { panNode } from './nodes/pan.node'
import { perlinNode } from './nodes/perlin.node'
import { pingPongNode } from './nodes/ping-pong.node'
import { randomNode } from './nodes/random.node'
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
import { absNode, addNode, clampNode, compareNode, constantNode, divideNode, invertNode, maxNode, minNode, multiplyNode, subtractNode } from './nodes/math/arithmetic'
import { dbToGainNode, gainToDbNode, hzToMsNode, msToHzNode, ratioToSemitonesNode, semitonesToRatioNode } from './nodes/math/conversions'
import { clockNode, controlDelayNode, counterNode, dividerNode, edgeNode, flipFlopNode, schmittNode } from './nodes/math/logic'
import { sampleHoldNode } from './nodes/math/sample-hold.node'
import { hzToMidiNode, midiToHzNode } from './nodes/math/midi'
import { mapRangeNode, mixNode, quantizeNode } from './nodes/math/shaping'
import { smoothNode } from './nodes/math/smooth.node'
import { selectorNode } from './nodes/selector.node'
import { switchNode } from './nodes/switch.node'
import { xyPadNode } from './nodes/xy-pad.node'
import { documented } from './document'
import { nodeDocs } from './node-docs'
import type { NodeDefinition } from './types'

const plainDefinitions: readonly NodeDefinition[] = [
  noteNode,
  oscillatorNode,
  noiseNode,
  geigerNode,
  samplerNode,
  envelopeNode,
  gainNode,
  filterNode,
  lfoNode,
  perlinNode,
  randomNode,
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
  selectorNode,
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
  subtractNode,
  divideNode,
  absNode,
  constantNode,
  semitonesToRatioNode,
  ratioToSemitonesNode,
  dbToGainNode,
  gainToDbNode,
  hzToMsNode,
  msToHzNode,
  sampleHoldNode,
  schmittNode,
  edgeNode,
  flipFlopNode,
  counterNode,
  clockNode,
  dividerNode,
  controlDelayNode,
  followerNode,
  levelNode,
  pitchNode,
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
