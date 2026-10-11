import {
  type Project,
  type SampleInfo,
  parseProject,
  serializeProject,
} from '@core'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { sha256Hex } from './hash'

/** Largest single file we will inflate from a package; guards against zip bombs. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024
const PROJECT_ENTRY = 'project.json'

const sampleEntry = (sample: SampleInfo): string => `samples/${sample.id}.${sample.extension}`

/** Zip files start with "PK\x03\x04". */
export const isPackage = (bytes: Uint8Array): boolean =>
  bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4

export interface ExportedFile {
  readonly fileName: string
  readonly mimeType: string
  readonly bytes: Uint8Array
  /** Library samples whose audio could not be found, so they are not in the file. */
  readonly missing: readonly SampleInfo[]
}

/** `My Cool Project!` -> `my-cool-project` */
export const fileStem = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'

/**
 * A project without samples is a plain `.sfxlab.json`. With samples it becomes a `.sfxlab` zip:
 * the same JSON as `project.json` plus each sample's original bytes under `samples/`.
 */
export const exportProject = async (
  project: Project,
  readSample: (id: string) => Promise<Uint8Array | undefined>,
): Promise<ExportedFile> => {
  const json = serializeProject(project, 2)
  if (project.samples.length === 0) {
    return {
      fileName: `${fileStem(project.name)}.sfxlab.json`,
      mimeType: 'application/json',
      bytes: strToU8(json),
      missing: [],
    }
  }

  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {
    [PROJECT_ENTRY]: strToU8(json),
  }
  const missing: SampleInfo[] = []
  for (const sample of project.samples) {
    const data = await readSample(sample.id)
    if (!data) {
      missing.push(sample)
      continue
    }
    // Compressed formats gain nothing from deflate; uncompressed WAV shrinks a lot.
    files[sampleEntry(sample)] = [data, { level: sample.extension === 'wav' ? 6 : 0 }]
  }

  return {
    fileName: `${fileStem(project.name)}.sfxlab`,
    mimeType: 'application/zip',
    bytes: zipSync(files),
    missing,
  }
}

export type ImportResult =
  | {
      readonly ok: true
      readonly project: Project
      readonly warnings: readonly string[]
      /** Audio found inside the file (empty for plain JSON), verified against each sample's hash. */
      readonly samples: ReadonlyMap<string, Uint8Array>
    }
  | { readonly ok: false; readonly error: string }

const readPackage = async (bytes: Uint8Array): Promise<ImportResult> => {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, {
      filter: (file) =>
        file.originalSize <= MAX_ENTRY_BYTES &&
        (file.name === PROJECT_ENTRY || file.name.startsWith('samples/')),
    })
  } catch {
    return { ok: false, error: 'The file is not a valid SFX Lab package.' }
  }

  const projectBytes = entries[PROJECT_ENTRY]
  if (!projectBytes) return { ok: false, error: `The package has no ${PROJECT_ENTRY}.` }

  const parsed = parseProject(strFromU8(projectBytes))
  if (!parsed.ok) return parsed

  const warnings = [...parsed.warnings]
  const samples = new Map<string, Uint8Array>()
  for (const sample of parsed.project.samples) {
    const data = entries[sampleEntry(sample)]
    if (!data) {
      warnings.push(`Sample "${sample.name}" is missing from the package`)
    } else if ((await sha256Hex(data)) !== sample.id) {
      warnings.push(`Sample "${sample.name}" does not match its checksum and was skipped`)
    } else {
      samples.set(sample.id, data)
    }
  }
  return { ok: true, project: parsed.project, warnings, samples }
}

/** Reads either format, detected from the file's first bytes. Never throws. */
export const importProject = async (bytes: Uint8Array): Promise<ImportResult> => {
  if (isPackage(bytes)) return readPackage(bytes)

  const parsed = parseProject(new TextDecoder().decode(bytes))
  return parsed.ok ? { ...parsed, samples: new Map() } : parsed
}
