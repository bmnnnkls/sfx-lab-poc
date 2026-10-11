import 'fake-indexeddb/auto'
import { type Project, addSamples, createDemoProject } from '@core'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from './hash'
import { exportProject, fileStem, importProject, isPackage } from './project-transfer'
import { createIndexedDbSampleStorage, createMemorySampleStorage } from './sample-storage'

const bytesOf = (text: string) => strToU8(text)

const withSample = async (name: string, content: string): Promise<{ project: Project; id: string; bytes: Uint8Array }> => {
  const bytes = bytesOf(content)
  const id = await sha256Hex(bytes)
  const project = addSamples(createDemoProject(), [
    { id, name, extension: 'wav', durationSeconds: 1, sampleRate: 44100, channels: 1, bytes: bytes.length },
  ])
  return { project, id, bytes }
}

describe('sha256Hex', () => {
  it('matches the known SHA-256 test vector', async () => {
    expect(await sha256Hex(bytesOf('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe.each([
  ['memory', () => createMemorySampleStorage()],
  ['IndexedDB', () => createIndexedDbSampleStorage(`test-${Math.random()}`)],
])('sample storage (%s)', (_label, create) => {
  it('stores, finds and deletes sample bytes by id', async () => {
    const storage = create()
    expect(await storage.has('x')).toBe(false)
    expect(await storage.get('x')).toBeUndefined()

    await storage.put('x', Uint8Array.of(1, 2, 3))
    expect(await storage.has('x')).toBe(true)
    expect(Array.from((await storage.get('x'))!)).toEqual([1, 2, 3])

    await storage.delete('x')
    expect(await storage.has('x')).toBe(false)
  })
})

describe('project files', () => {
  it('exports a project without samples as plain JSON that imports back', async () => {
    const project = createDemoProject()
    const file = await exportProject(project, async () => undefined)

    expect(file.fileName).toBe('demo-project.sfxlab.json')
    expect(isPackage(file.bytes)).toBe(false)

    const result = await importProject(file.bytes)
    expect(result.ok && result.project).toEqual(project)
    expect(result.ok && result.samples.size).toBe(0)
  })

  it('packages samples with the project and restores them on import', async () => {
    const { project, id, bytes } = await withSample('Kick', 'pretend this is a wav file')
    const file = await exportProject(project, async (wanted) => (wanted === id ? bytes : undefined))

    expect(file.fileName).toBe('demo-project.sfxlab')
    expect(file.mimeType).toBe('application/zip')
    expect(isPackage(file.bytes)).toBe(true)
    expect(file.missing).toEqual([])

    const result = await importProject(file.bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project).toEqual(project)
    expect(result.warnings).toEqual([])
    expect(Array.from(result.samples.get(id)!)).toEqual(Array.from(bytes))
  })

  it('reports samples whose audio is unavailable instead of failing the export', async () => {
    const { project, id } = await withSample('Lost', 'gone')
    const file = await exportProject(project, async () => undefined)

    expect(file.missing.map((s) => s.id)).toEqual([id])
    const result = await importProject(file.bytes)
    expect(result.ok && result.warnings.join()).toMatch(/Sample "Lost" is missing from the package/)
  })

  it('refuses sample audio that does not match its hash', async () => {
    const { project, id } = await withSample('Fake', 'the real bytes')
    const file = await exportProject(project, async () => bytesOf('tampered bytes!'))

    const result = await importProject(file.bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.samples.has(id)).toBe(false)
    expect(result.warnings.join()).toMatch(/does not match its checksum/)
  })

  it('rejects broken packages and non-project files with a message', async () => {
    const brokenZip = Uint8Array.of(0x50, 0x4b, 3, 4, 1, 2, 3)
    expect(await importProject(brokenZip)).toMatchObject({ ok: false, error: expect.stringMatching(/not a valid/) })

    const noProject = zipSync({ 'hello.txt': bytesOf('hi') })
    expect(await importProject(noProject)).toMatchObject({ ok: false, error: expect.stringMatching(/no project\.json/) })

    expect(await importProject(bytesOf('{"hello":1}'))).toMatchObject({ ok: false })
  })

  it('ignores unexpected entries inside a package', async () => {
    const project = createDemoProject()
    const file = await exportProject(project, async () => undefined)
    const plainJson = new TextDecoder().decode(file.bytes)
    const packed = zipSync({ 'project.json': bytesOf(plainJson), '../evil.txt': bytesOf('x'), 'other/file': bytesOf('y') })

    const result = await importProject(packed)
    expect(result.ok && result.project).toEqual(project)
  })
})

describe('fileStem', () => {
  it('slugifies the project name', () => {
    expect(fileStem('My Cool Project!')).toBe('my-cool-project')
    expect(fileStem('  ')).toBe('project')
  })
})
