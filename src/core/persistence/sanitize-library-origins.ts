import type { LibraryOrigin } from '../library'
import { isRecord, type Warn } from './raw'
export const sanitizeLibraryOrigins = (raw: unknown, warn: Warn): LibraryOrigin[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid library origins list'); return undefined }
  if (raw.length > 4096) warn('Library origins limited to 4096')
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
  const origins: LibraryOrigin[] = raw.slice(0, 4096).flatMap(entry => {
    if (!isRecord(entry) || !id(entry.itemId)) { warn('Invalid library origin skipped'); return [] }
    return [{ itemId: entry.itemId,
      ...(id(entry.revisionId) && { revisionId: entry.revisionId }),
      ...(id(entry.trackId) && { trackId: entry.trackId }),
      ...(id(entry.clipId) && { clipId: entry.clipId }),
      ...(['patch', 'notes', 'fx'].includes(entry.domain as string) && { domain: entry.domain as 'patch' | 'notes' | 'fx' }),
    }]
  })
  return origins.length ? origins : undefined
}
