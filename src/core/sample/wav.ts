/** Encodes mono audio as a 16-bit PCM WAV file. */
export const encodeWav = (data: Float32Array, sampleRate: number): Uint8Array => {
  const bytesPerSample = 2
  const dataSize = data.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  text(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true) // byte rate
  view.setUint16(32, bytesPerSample, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < data.length; i++) {
    const clamped = Math.max(-1, Math.min(1, data[i] ?? 0))
    view.setInt16(44 + i * bytesPerSample, Math.round(clamped * 32767), true)
  }
  return new Uint8Array(buffer)
}
