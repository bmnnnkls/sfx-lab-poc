import { describe, expect, it } from 'vitest'
import { formatHz, selectionText } from './WaveStatus'

describe('the status bar', () => {
  it('says the cursor, or the selection, its channels and its band', () => {
    expect(selectionText(null, 24_000, 48_000)).toBe('Cursor 0:00.500')
    expect(selectionText({ from: 48_000, to: 96_000, channels: 'left' }, 0, 48_000)).toBe('Selection 0:01.000 – 0:02.000 (0:01.000), left only')
    expect(selectionText({ from: 48_000, to: 96_000, channels: 'both', band: { low: 200, high: 2000 } }, 0, 48_000)).toBe(
      'Selection 0:01.000 – 0:02.000 (0:01.000) · 200 Hz – 2.0 kHz',
    )
  })

  it('says frequencies in Hz under 1 kHz, else in kHz', () => {
    expect([formatHz(0), formatHz(199.6), formatHz(999), formatHz(1000), formatHz(12_345)]).toEqual(['0 Hz', '200 Hz', '999 Hz', '1.0 kHz', '12.3 kHz'])
  })
})
