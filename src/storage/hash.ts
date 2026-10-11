/** SHA-256 of `bytes` as lowercase hex. Needs a secure context (https or localhost). */
export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Hashing is unavailable here; open the app over https or from localhost.')
  }
  const digest = await subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
