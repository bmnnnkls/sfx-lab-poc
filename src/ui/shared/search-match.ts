/** Folds case and accents, so "Délai" matches "delai". */
export const norm = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

const wordsOf = (text: string): string[] => norm(text).split(/[^a-z0-9]+/).filter(Boolean)

/** True when every letter of `query` appears in `text`, in order ("mdhz" is in "midi to hz"). */
const isSubsequence = (query: string, text: string): boolean => {
  let at = 0
  for (const letter of text) if (letter === query[at] && ++at === query.length) return true
  return query.length === 0
}

/** How well the whole query matches the label: lower is better, undefined for no match. */
const labelTier = (query: string, label: string): number | undefined => {
  const text = norm(label)
  if (text === query) return 0
  if (text.startsWith(query)) return 1
  if (wordsOf(label).some((word) => word.startsWith(query))) return 2
  if (text.includes(query)) return 3
  if (isSubsequence(query.replace(/\s+/g, ''), text.replace(/\s+/g, ''))) return 4
  return undefined
}

/** One word of the query against what is not the label: the first list ranks 5, the next 6, and so on. */
const otherTier = (word: string, others: readonly (readonly string[])[]): number | undefined => {
  const index = others.findIndex((texts) => texts.some((text) => norm(text).includes(word)))
  return index === -1 ? undefined : 5 + index
}

/**
 * The tier of a label for a query (`norm`ed and trimmed; undefined: not a match), lower is better: label equal, label
 * prefix, a word of the label, label contains, letters in order. Failing the whole query, every word of it must be
 * found somewhere, in the label or in `others` (QuickAdd's category, keywords and description), and the label ranks by
 * its weakest word, below any whole-label match.
 */
export const tierOf = (query: string, label: string, others: readonly (readonly string[])[] = []): number | undefined => {
  const whole = labelTier(query, label)
  if (whole !== undefined) return whole
  const words = query.split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  let weakest = 0
  for (const word of words) {
    const tier = labelTier(word, label) ?? otherTier(word, others)
    if (tier === undefined) return undefined
    weakest = Math.max(weakest, tier === 4 ? 5 : tier) // a stray subsequence is no better than a category hit
  }
  return Math.max(weakest, 5) // several words, none of them the whole label: below any label match
}
