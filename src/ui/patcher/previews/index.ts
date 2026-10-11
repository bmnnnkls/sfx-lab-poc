import { envelopePreview } from './envelope'
import { filterPreview } from './filter'
import { lfoPreview } from './lfo'
import { gainPreview, panPreview, widthPreview } from './level'
import { delayPreview, reverbPreview } from './space'
import { oscillatorPreview } from './oscillator'
import { type Preview, type Values } from './types'

export { PREVIEW_HEIGHT, PREVIEW_WIDTH, type Preview, type Shape, type Values } from './types'

const PREVIEWS: Readonly<Record<string, (values: Values) => Preview>> = {
  oscillator: oscillatorPreview,
  filter: filterPreview,
  envelope: envelopePreview,
  lfo: lfoPreview,
  gain: gainPreview,
  pan: panPreview,
  width: widthPreview,
  delay: delayPreview,
  pingPong: delayPreview,
  reverb: reverbPreview,
  stereoReverb: reverbPreview,
}

/** Does this kind of node have a picture on its card? */
export const hasPreview = (type: string): boolean => type in PREVIEWS

/** The picture of a node of this type working with these numbers; undefined for a node that has none. */
export const nodePreview = (type: string, values: Values): Preview | undefined => PREVIEWS[type]?.(values)
