import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LINK_LIMITS } from '../library'
import { parseProject, serializeProject } from './index'

const text = () => readFileSync(new URL('./fixtures/v13-library-link.sfxlab.json', import.meta.url), 'utf8')
const parseOk = (raw: string) => {
  const result = parseProject(raw)
  if (!result.ok) throw new Error(result.error)
  return result
}
/** The fixture with its one origin's link replaced, and that origin repeated `count` times. */
const withLinks = (link: unknown, count = 1) => {
  const raw = JSON.parse(text())
  const origin = raw.project.libraryOrigins[0]
  raw.project.libraryOrigins = Array.from({ length: count }, () => ({ ...origin, link }))
  return parseOk(JSON.stringify(raw))
}
const pairs = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => [`${prefix}${index}`, `${prefix}-copy${index}`])

describe('format v13: the optional library link', () => {
  it('loads the committed fixture without warnings and reads it back identical, still as v13', () => {
    const { project, warnings } = parseOk(text())
    expect(warnings).toEqual([])
    const [origin] = project.libraryOrigins!
    expect(origin!.owner).toEqual({ kind: 'track', trackId: origin!.trackId })
    expect(origin!.link!.shape).toMatch(/^[0-9a-f]{16}$/)
    expect(origin!.link!.nodes.length).toBeGreaterThan(0)
    expect(origin!.link!.modules).toHaveLength(1)
    const saved = serializeProject(project)
    expect(JSON.parse(saved).version).toBe(13)
    expect(parseOk(saved).project).toEqual(project)
  })

  it('still loads an origin of the older shape, with neither owner nor link', () => {
    const raw = JSON.parse(text())
    raw.project.libraryOrigins = [{ itemId: 'item', revisionId: 'revision', trackId: 'track', domain: 'patch' }]
    const { project, warnings } = parseOk(JSON.stringify(raw))
    expect(warnings).toEqual([])
    expect(project.libraryOrigins).toEqual([{ itemId: 'item', revisionId: 'revision', trackId: 'track', domain: 'patch' }])
  })

  it('keeps a link at each bound and drops one past it, keeping the origin', () => {
    const atBound = withLinks({ shape: '0123456789abcdef', nodes: pairs(LINK_LIMITS.nodes, 'n'), modules: pairs(LINK_LIMITS.modules, 'm') })
    expect(atBound.warnings).toEqual([])
    expect(atBound.project.libraryOrigins![0]!.link!.nodes).toHaveLength(LINK_LIMITS.nodes)
    for (const link of [
      { shape: '0123456789abcdef', nodes: pairs(LINK_LIMITS.nodes + 1, 'n'), modules: [] },
      { shape: '0123456789abcdef', nodes: [], modules: pairs(LINK_LIMITS.modules + 1, 'm') },
    ]) {
      const { project, warnings } = withLinks(link)
      expect(project.libraryOrigins![0]!.link).toBeUndefined()
      expect(project.libraryOrigins![0]!.itemId).toBeTruthy()
      expect(warnings).toEqual([`Library link dropped: over ${LINK_LIMITS.nodes} nodes or ${LINK_LIMITS.modules} modules`])
    }
  })

  it('bounds the pairs of every link together, dropping the links past it', () => {
    const perLink = LINK_LIMITS.nodes, fit = LINK_LIMITS.pairs / perLink
    const { project, warnings } = withLinks({ shape: '0123456789abcdef', nodes: pairs(perLink, 'n'), modules: [] }, fit + 2)
    expect(project.libraryOrigins).toHaveLength(fit + 2)
    expect(project.libraryOrigins!.filter((origin) => origin.link)).toHaveLength(fit)
    expect(warnings).toEqual(Array(2).fill(`Library link dropped: links limited to ${LINK_LIMITS.pairs} pairs`))
  })

  it('drops a link with a malformed pair or shape, and an owner that is not one', () => {
    const malformed = [
      { shape: '0123456789abcdef', nodes: [['a', 'b'], ['c']], modules: [] },
      { shape: '0123456789abcdef', nodes: [['a', 7]], modules: [] },
      { shape: '0123456789abcdef', nodes: [['a', 'x'.repeat(257)]], modules: [] },
      { shape: '0123456789abcdef', nodes: [], modules: {} },
      { shape: 'not a hash', nodes: [], modules: [] },
      { nodes: [], modules: [] },
      'link',
    ]
    for (const link of malformed) {
      const { project, warnings } = withLinks(link)
      expect(project.libraryOrigins![0]!.link).toBeUndefined()
      expect(warnings).toEqual(['Invalid library link dropped'])
    }
    const raw = JSON.parse(text())
    raw.project.libraryOrigins[0].owner = { kind: 'track' }
    const { project, warnings } = parseOk(JSON.stringify(raw))
    expect(project.libraryOrigins![0]!.owner).toBeUndefined()
    expect(project.libraryOrigins![0]!.link).toBeDefined()
    expect(warnings).toEqual(['Invalid library origin owner dropped'])
  })
})
