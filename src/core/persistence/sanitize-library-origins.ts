import { LINK_LIMITS, type LibraryLink, type LibraryOrigin } from '../library'
import { isRecord, type Warn } from './raw'
import { readControlOwner } from './sanitize-control-values'

const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256

/** A link's pairs, or undefined when the list or any pair is malformed. */
const readPairs = (raw: unknown): (readonly [string, string])[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const pairs: (readonly [string, string])[] = []
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2 || !id(pair[0]) || !id(pair[1])) return undefined
    pairs.push([pair[0], pair[1]])
  }
  return pairs
}

/**
 * Origins from untrusted data, known fields only. A link past a bound (`LINK_LIMITS`: its own node or module pairs,
 * or every link's pairs together) or with a malformed pair is dropped with a warning; the origin stays.
 */
export const sanitizeLibraryOrigins = (raw: unknown, warn: Warn): LibraryOrigin[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid library origins list'); return undefined }
  if (raw.length > 4096) warn('Library origins limited to 4096')
  let pairs = 0
  const readLink = (value: unknown): LibraryLink | undefined => {
    if (value === undefined) return undefined
    const nodes = isRecord(value) ? readPairs(value.nodes) : undefined, modules = isRecord(value) ? readPairs(value.modules) : undefined
    if (!isRecord(value) || typeof value.shape !== 'string' || !/^[0-9a-f]{16}$/.test(value.shape) || !nodes || !modules) { warn('Invalid library link dropped'); return undefined }
    if (nodes.length > LINK_LIMITS.nodes || modules.length > LINK_LIMITS.modules) { warn(`Library link dropped: over ${LINK_LIMITS.nodes} nodes or ${LINK_LIMITS.modules} modules`); return undefined }
    if (pairs + nodes.length + modules.length > LINK_LIMITS.pairs) { warn(`Library link dropped: links limited to ${LINK_LIMITS.pairs} pairs`); return undefined }
    pairs += nodes.length + modules.length
    return { shape: value.shape, nodes, modules }
  }
  const origins: LibraryOrigin[] = raw.slice(0, 4096).flatMap(entry => {
    if (!isRecord(entry) || !id(entry.itemId)) { warn('Invalid library origin skipped'); return [] }
    const owner = entry.owner === undefined ? undefined : readControlOwner(entry.owner)
    if (entry.owner !== undefined && !owner) warn('Invalid library origin owner dropped')
    const link = readLink(entry.link)
    return [{ itemId: entry.itemId,
      ...(id(entry.revisionId) && { revisionId: entry.revisionId }),
      ...(id(entry.trackId) && { trackId: entry.trackId }),
      ...(owner && { owner }),
      ...(id(entry.clipId) && { clipId: entry.clipId }),
      ...(['patch', 'notes', 'fx'].includes(entry.domain as string) && { domain: entry.domain as 'patch' | 'notes' | 'fx' }),
      ...(link && { link }),
    }]
  })
  return origins.length ? origins : undefined
}
