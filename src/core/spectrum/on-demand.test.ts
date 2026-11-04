import { describe, expect, it } from 'vitest'
import { SPECTRUM_WINDOW, askCovers, createStft, onDemandColumnsFor, onDemandMinHop, sameAsk, spectrumAsk, spectrumColumnBytes } from '.'

const FRAMES = 480_000
const view = (framesPerPixel: number, startFrame = 100_000, width = 1000) => ({ startFrame, framesPerPixel, width })

describe('spectrumAsk', () => {
  it('asks nothing at or above the pyramid’s hop a pixel', () => {
    expect(spectrumAsk(view(512), 's', 2048, FRAMES)).toBeNull()
    expect(spectrumAsk(view(2000), 's', 2048, FRAMES)).toBeNull()
    expect(spectrumAsk(view(255), 's', 1024, FRAMES)).not.toBeNull()
  })

  it('asks for a column a pixel, at least an eighth of the hop apart, over the view and a quarter of it on each side', () => {
    expect(onDemandMinHop(2048)).toBe(64)
    const wide = spectrumAsk(view(100), 's', 2048, FRAMES)!
    expect(wide.hop).toBe(100)
    expect(wide.firstColumn).toBe(Math.floor((100_000 - 25_000) / 100))
    expect(wide.count).toBe(Math.ceil((100_000 + 100_000 + 25_000) / 100) - wide.firstColumn)
    expect(spectrumAsk(view(10), 's', 2048, FRAMES)!.hop).toBe(64)
    // At the start of the sample, nothing before it.
    expect(spectrumAsk(view(100, 0), 's', 2048, FRAMES)!.firstColumn).toBe(0)
  })

  it('is the same ask for the same view', () => {
    expect(sameAsk(spectrumAsk(view(100), 's', 2048, FRAMES), spectrumAsk(view(100), 's', 2048, FRAMES))).toBe(true)
    expect(sameAsk(spectrumAsk(view(100), 's', 2048, FRAMES), spectrumAsk(view(100, 101_000), 's', 2048, FRAMES))).toBe(false)
    expect(sameAsk(spectrumAsk(view(100), 's', 2048, FRAMES), spectrumAsk(view(100), 't', 2048, FRAMES))).toBe(false)
  })
})

describe('onDemandColumnsFor', () => {
  const ask = spectrumAsk(view(100), 's', 2048, FRAMES)!
  const answered = { ...ask, bins: 1025, bytes: [new Uint8Array(ask.count * 1025)] }

  it('draws the view, and a small scroll, from the answer, each pixel from the columns it covers', () => {
    const columns = onDemandColumnsFor(view(100), answered, FRAMES)!
    expect(columns.kind).toBe('on-demand')
    expect(columns.from[0]).toBe(100_000 / 100 - ask.firstColumn)
    expect(columns.to[0]! - columns.from[0]!).toBe(1)
    expect(onDemandColumnsFor(view(100, 120_000), answered, FRAMES)).not.toBeNull()
    expect(askCovers(ask, view(100, 120_000), FRAMES)).toBe(true)
  })

  it('refuses another zoom, or a view past the answer', () => {
    expect(onDemandColumnsFor(view(90), answered, FRAMES)).toBeNull()
    expect(onDemandColumnsFor(view(100, 200_000), answered, FRAMES)).toBeNull()
    expect(askCovers(ask, view(100, 200_000), FRAMES)).toBe(false)
  })
})

describe('spectrumColumnBytes at a view’s hop', () => {
  it('gives each column the STFT at its centre', () => {
    const channel = Float32Array.from({ length: 20_000 }, (_, i) => Math.sin(i * 0.05) * 0.4 + Math.sin(i * i * 1e-5) * 0.2)
    const stft = createStft({ size: 2048, hop: 512, window: SPECTRUM_WINDOW })
    const hop = 75
    const bytes = spectrumColumnBytes(2048, channel.slice(2000, 14_000), 50, 120, 2000, hop)
    const expected = new Uint8Array(1025)
    for (const column of [50, 77, 119]) {
      stft.bytes(channel, column * hop + hop / 2, expected)
      expect(Buffer.from(bytes.subarray((column - 50) * 1025, (column - 49) * 1025)).equals(Buffer.from(expected)), `column ${column}`).toBe(true)
    }
  })
})
