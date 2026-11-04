import { type BandEdit, applyBandEdit, bandEditChanged, spectrumColumnBytes } from '@core'

/**
 * What the main thread and the spectrum worker say to each other. A columns request is one chunk of base columns with
 * the frames their windows read (copied and transferred), its answer the chunk's bytes (transferred back). A band-edit
 * request is a band edit with the frames it reads, its answer the frames it changed. The worker keeps nothing between
 * requests.
 */
export interface SpectrumRequest {
  readonly kind: 'columns'
  readonly id: number
  readonly fftSize: number
  /** Frames between columns: the pyramid's hop for base columns, or a view's own. */
  readonly hop: number
  /** Columns `from` up to `to`, each centred at `column · hop + hop / 2`. */
  readonly from: number
  readonly to: number
  /** The frame the channels' slices start at. */
  readonly offset: number
  readonly channels: readonly Float32Array[]
}

export interface SpectrumAnswer {
  readonly kind: 'columns'
  readonly id: number
  readonly from: number
  readonly to: number
  /** Per channel, `to − from` columns of `fftSize / 2 + 1` bytes. */
  readonly bytes: readonly Uint8Array[]
}

/** A band edit of a sample of `frames` frames at `sampleRate`, with every channel's frames from `offset` that it reads. */
export interface BandEditRequest {
  readonly kind: 'band-edit'
  readonly id: number
  readonly edit: BandEdit
  readonly offset: number
  readonly frames: number
  readonly sampleRate: number
  readonly channels: readonly Float32Array[]
}

export interface BandEditAnswer {
  readonly kind: 'band-edit'
  readonly id: number
  /** Every channel's frames from `from` after the edit (`bandEditChanged`). */
  readonly from: number
  readonly frames: readonly Float32Array[]
}

export type SpectrumMessage = SpectrumRequest | BandEditRequest
export type SpectrumReply = SpectrumAnswer | BandEditAnswer

/** The worker's columns job, a function so the fallback and the tests run the same code. */
export const answerSpectrum = (request: SpectrumRequest): SpectrumAnswer => ({
  kind: 'columns',
  id: request.id,
  from: request.from,
  to: request.to,
  bytes: request.channels.map((channel) => spectrumColumnBytes(request.fftSize, channel, request.from, request.to, request.offset, request.hop)),
})

/** The worker's band-edit job (`applyBandEdit`). */
export const answerBandEdit = (request: BandEditRequest): BandEditAnswer => ({
  kind: 'band-edit',
  id: request.id,
  from: bandEditChanged(request.edit, request.frames).from,
  frames: applyBandEdit(request, request.edit),
})

/** The worker's whole job: each message's answer, and the buffers to hand back without copying. */
export const replyTo = (message: SpectrumMessage): { reply: SpectrumReply; transfer: ArrayBuffer[] } => {
  if (message.kind === 'band-edit') {
    const reply = answerBandEdit(message)
    return { reply, transfer: reply.frames.map((frames) => frames.buffer as ArrayBuffer) }
  }
  const reply = answerSpectrum(message)
  return { reply, transfer: reply.bytes.map((bytes) => bytes.buffer as ArrayBuffer) }
}
