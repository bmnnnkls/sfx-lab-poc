import { spectrumColumnBytes } from '@core'

/**
 * What the main thread and the spectrum worker say to each other. A request is one chunk of base columns with the
 * frames their windows read (copied and transferred), an answer the chunk's bytes (transferred back). The worker keeps
 * nothing between requests.
 */
export interface SpectrumRequest {
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
  readonly id: number
  readonly from: number
  readonly to: number
  /** Per channel, `to − from` columns of `fftSize / 2 + 1` bytes. */
  readonly bytes: readonly Uint8Array[]
}

/** The worker's whole job, a function so the fallback and the tests run the same code. */
export const answerSpectrum = (request: SpectrumRequest): SpectrumAnswer => ({
  id: request.id,
  from: request.from,
  to: request.to,
  bytes: request.channels.map((channel) => spectrumColumnBytes(request.fftSize, channel, request.from, request.to, request.offset, request.hop)),
})
