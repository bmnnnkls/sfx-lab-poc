import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseProject, serializeProject } from './index'
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/v7-library.sfxlab.json', import.meta.url), 'utf8'))
describe('v7 library provenance', () => {
  it('round trips the committed fixture and reconstructs only bounded known metadata', () => {
    const raw = fixture()
    raw.project.libraryOrigins = [{ itemId: 'item', revisionId: 'revision', trackId: 'track', clipId: 'clip', domain: 'fx', secret: 'ignored', link: { live: true } }, { itemId: '' }, null, { itemId: 'x'.repeat(257) }]
    const result = parseProject(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.libraryOrigins).toEqual([{ itemId: 'item', revisionId: 'revision', trackId: 'track', clipId: 'clip', domain: 'fx' }])
    expect(result.warnings.filter(w => w.includes('library origin'))).toHaveLength(3)
    const reloaded = parseProject(serializeProject(result.project))
    expect(reloaded.ok && reloaded.project).toEqual(result.project)
  })
  it('limits collections and rejects malformed origin lists', () => {
    const raw = fixture(); raw.project.libraryOrigins = Array.from({ length: 4097 }, () => ({ itemId: 'item' }))
    const result = parseProject(JSON.stringify(raw))
    expect(result.ok && result.project.libraryOrigins).toHaveLength(4096)
    expect(result.ok && result.warnings).toContain('Library origins limited to 4096')
    raw.project.libraryOrigins = {}
    const malformed = parseProject(JSON.stringify(raw))
    expect(malformed.ok && malformed.project.libraryOrigins).toBeUndefined()
    expect(malformed.ok && malformed.warnings).toContain('Invalid library origins list')
  })
})
