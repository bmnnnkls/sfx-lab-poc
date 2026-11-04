import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { LIBRARY_ARCHIVE_LIMITS, readLibraryArchive } from './library-archive'

const MIB = 1024 * 1024
const archiveWith = (bytes: number) =>
  zipSync({ 'manifest.json': strToU8('{}'), [`samples/${'a'.repeat(64)}`]: new Uint8Array(bytes) }, { level: 1 })

describe('the library archive', () => {
  it('takes a sample of up to 64 MiB, the size of a 120 s stereo float WAV and more', () => {
    expect(LIBRARY_ARCHIVE_LIMITS.entry).toBe(64 * MIB)
    expect(readLibraryArchive(archiveWith(40 * MIB)).get(`samples/${'a'.repeat(64)}`)?.length).toBe(40 * MIB)
  })

  it('refuses a sample over the cap before inflating it', () => {
    expect(() => readLibraryArchive(archiveWith(65 * MIB))).toThrow(/expanded byte limit/)
  })
})
