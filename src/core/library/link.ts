import { type AssetPayload, assetSignature } from '../preset'

/**
 * A stable 64-bit hash of a string, as 16 hex digits: two 32-bit lanes mixed over its UTF-16 code units (cyrb53's
 * scheme, kept to 64 bits). Not cryptographic; a link only compares it with its own graph's.
 */
export const stableHash64 = (text: string): string => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/** A link's `shape`: the hash of a graph's structural signature. */
export const linkShape = (payload: AssetPayload): string => stableHash64(assetSignature(payload))
