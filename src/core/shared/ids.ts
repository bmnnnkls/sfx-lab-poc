const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const SUFFIX_LENGTH = 8

/**
 * Random, human-readable id such as `node_k3f9x2ab`. Random rather than a counter so ids stay
 * unique across sessions: projects are saved and reloaded, and new ids must never collide.
 */
export const createId = (prefix: string): string => {
  let suffix = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${prefix}_${suffix}`
}
