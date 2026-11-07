import { byteToDb } from '@core'
import type { SpectrumSettings } from '@state'
import type { LaneRenderer, SpectrumLaneColumns } from './lane-renderers'

/**
 * The spectrogram's drawing: pixel rows to bins on the frequency scale (`binRows`), bytes to colors through one table
 * (`colorLookup`: the theme's stops, shifted by the floor), and the frequency scale beside the lane (`frequencyMarks`). The pixels are
 * written into an image at the lane's size in CSS pixels, one column per pixel as the waveform is.
 */

/** The log scale's lowest frequency. */
export const LOG_SCALE_FROM_HZ = 20
/** A frequency label needs this much room from the one below it. */
const LABEL_SPACING_PX = 24
const LOG_LABELS_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000]
const LINEAR_STEPS_HZ = [1000, 2000, 5000, 10_000]

/** The theme tokens of the colors, quiet to loud: from the background through violet and the accent's amber to white. */
export const SPECTRUM_TOKENS = ['--spectrum-0', '--spectrum-1', '--spectrum-2', '--spectrum-3', '--spectrum-4'] as const

/** `#rgb` or `#rrggbb` as its channels; anything else is black. */
export const parseHex = (hex: string): readonly [number, number, number] => {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!digits) return [0, 0, 0]
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
  return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as unknown as readonly [number, number, number]
}

/** The 256 colors from `stops` (hex, quiet to loud, evenly spaced), blended between neighbours. */
export const spectrumColors = (stops: readonly string[]): readonly (readonly [number, number, number])[] => {
  const rgb = stops.map(parseHex)
  const last = Math.max(0, rgb.length - 1)
  return Array.from({ length: 256 }, (_, index) => {
    const at = (index / 255) * last
    const from = Math.min(Math.floor(at), Math.max(0, last - 1))
    const mix = last === 0 ? 0 : at - from
    const a = rgb[from] ?? [0, 0, 0]
    const b = rgb[Math.min(last, from + 1)] ?? a
    return [0, 1, 2].map((c) => Math.round(a[c]! + (b[c]! - a[c]!) * mix)) as unknown as readonly [number, number, number]
  })
}

/**
 * Each byte's color as an image pixel (RGBA in memory, so little-endian ABGR as a 32-bit word): the floor and quieter the
 * first of `stops`, 0 dB the last. The stops are the theme's (`SPECTRUM_TOKENS`); the renderer is made again with them
 * when the theme changes, so its table is per theme and floor.
 */
export const colorLookup = (floorDb: number, stops: readonly string[]): Uint32Array => {
  const colors = spectrumColors(stops)
  const lookup = new Uint32Array(256)
  for (let byte = 0; byte < 256; byte++) {
    const t = Math.min(1, Math.max(0, (byteToDb(byte) - floorDb) / -floorDb))
    const [r, g, b] = colors[Math.round(t * 255)]!
    lookup[byte] = (255 << 24) | (b << 16) | (g << 8) | r
  }
  return lookup
}

/** Where `hz` is on a lane `height` high (0 at the top, the Nyquist frequency). */
export const frequencyY = (hz: number, height: number, scale: SpectrumSettings['scale'], nyquist: number): number => {
  if (scale === 'linear') return height * (1 - hz / nyquist)
  const t = Math.log(Math.max(LOG_SCALE_FROM_HZ, hz) / LOG_SCALE_FROM_HZ) / Math.log(nyquist / LOG_SCALE_FROM_HZ)
  return height * (1 - t)
}

/** The frequency at the line `y` px from the top: `frequencyY` undone. */
export const frequencyAt = (y: number, height: number, scale: SpectrumSettings['scale'], nyquist: number): number => {
  const t = 1 - y / height
  return scale === 'linear' ? t * nyquist : LOG_SCALE_FROM_HZ * (nyquist / LOG_SCALE_FROM_HZ) ** t
}

/** Per pixel row from the top, the bins it draws, `from` up to `to`: the loudest of them, or the nearest where a row is finer than a bin. */
export interface RowBins {
  readonly from: Int32Array
  readonly to: Int32Array
}

export const binRows = (height: number, scale: SpectrumSettings['scale'], bins: number, sampleRate: number): RowBins => {
  const nyquist = sampleRate / 2
  const binHz = nyquist / (bins - 1)
  const from = new Int32Array(height)
  const to = new Int32Array(height)
  for (let y = 0; y < height; y++) {
    const low = Math.min(bins - 1, Math.max(0, Math.round(frequencyAt(y + 1, height, scale, nyquist) / binHz)))
    const high = y === 0 ? bins : Math.min(bins, Math.round(frequencyAt(y, height, scale, nyquist) / binHz))
    from[y] = low
    to[y] = Math.max(low + 1, high)
  }
  return { from, to }
}

/** The frequency scale's marks: a line and a label each, at least `LABEL_SPACING_PX` apart, from the bottom up. */
export const frequencyMarks = (height: number, scale: SpectrumSettings['scale'], nyquist: number): readonly { readonly y: number; readonly label: string }[] => {
  const label = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`)
  let candidates: number[]
  if (scale === 'log') candidates = LOG_LABELS_HZ.filter((hz) => hz < nyquist)
  else {
    const step = LINEAR_STEPS_HZ.find((hz) => (hz / nyquist) * height >= LABEL_SPACING_PX) ?? LINEAR_STEPS_HZ[LINEAR_STEPS_HZ.length - 1]!
    candidates = Array.from({ length: Math.ceil(nyquist / step) - 1 }, (_, index) => (index + 1) * step)
  }
  const marks: { y: number; label: string }[] = []
  let last = Infinity
  for (const hz of candidates) {
    const y = frequencyY(hz, height, scale, nyquist)
    if (last - y < LABEL_SPACING_PX || y < 5) continue
    marks.push({ y, label: label(hz) })
    last = y
  }
  return marks
}

/**
 * Paints one channel's columns into `pixels` (`width` × `height`, a row after another): per pixel column the loudest of
 * its columns per row's bins, through `colors`; the floor's color where the column draws nothing.
 */
export const paintSpectrum = (pixels: Uint32Array, width: number, height: number, columns: SpectrumLaneColumns | null, rows: RowBins, colors: Uint32Array): void => {
  const floor = colors[0]!
  if (!columns) return void pixels.fill(floor, 0, width * height)
  const { data, bins } = columns
  for (let x = 0; x < width; x++) {
    const first = columns.from[x] ?? 0
    const last = columns.to[x] ?? 0
    if (last <= first) {
      for (let y = 0; y < height; y++) pixels[y * width + x] = floor
      continue
    }
    for (let y = 0; y < height; y++) {
      let loudest = 0
      const low = rows.from[y]!
      const high = rows.to[y]!
      for (let column = first; column < last; column++) {
        const at = column * bins
        for (let bin = low; bin < high; bin++) {
          const value = data[at + bin]!
          if (value > loudest) loudest = value
        }
      }
      pixels[y * width + x] = colors[loudest]!
    }
  }
}

/**
 * The spectrogram renderer for one setting and sample rate: it keeps its row map, colors and image between draws, so
 * a redraw at the same size allocates nothing.
 */
export const spectrogramRenderer = (settings: Pick<SpectrumSettings, 'scale' | 'floorDb'>, sampleRate: number, stops: readonly string[]): LaneRenderer<SpectrumLaneColumns | null> => {
  const colors = colorLookup(settings.floorDb, stops)
  let rows: { key: string; bins: RowBins } | null = null
  let image: { canvas: HTMLCanvasElement; data: ImageData } | null = null
  return {
    draw: (context, columns, { width, height }) => {
      if (width <= 0 || height <= 0) return
      const bins = columns?.bins ?? 2
      const key = `${height}:${bins}`
      if (rows?.key !== key) rows = { key, bins: binRows(height, settings.scale, bins, sampleRate) }
      if (!image || image.data.width !== width || image.data.height !== height) {
        const canvas = image?.canvas ?? document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        image = { canvas, data: new ImageData(width, height) }
      }
      paintSpectrum(new Uint32Array(image.data.data.buffer), width, height, columns, rows.bins, colors)
      image.canvas.getContext('2d')?.putImageData(image.data, 0, 0)
      const smoothing = context.imageSmoothingEnabled
      context.imageSmoothingEnabled = false
      context.drawImage(image.canvas, 0, 0, width, height)
      context.imageSmoothingEnabled = smoothing
    },
    scale: (context, { width, height }, colors) => {
      context.fillStyle = colors.line
      context.font = '9px system-ui, sans-serif'
      context.textBaseline = 'middle'
      context.textAlign = 'right'
      for (const mark of frequencyMarks(height, settings.scale, sampleRate / 2)) {
        context.fillRect(width - 4, Math.round(mark.y), 4, 1)
        context.fillText(mark.label, width - 6, Math.min(height - 5, Math.max(5, mark.y)))
      }
    },
  }
}
