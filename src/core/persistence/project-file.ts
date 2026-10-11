import type { Project } from '../project'
import { CURRENT_VERSION, FORMAT } from './format'
import { migrate } from './migrations'
import { isRecord } from './raw'
import { sanitizeProject } from './sanitize-project'

export type ParseResult =
  | { readonly ok: true; readonly project: Project; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string }

const fail = (error: string): ParseResult => ({ ok: false, error })

/** Pass `space` (e.g. 2) for human-readable output; omit for compact storage. */
export const serializeProject = (project: Project, space?: number): string =>
  JSON.stringify({ format: FORMAT, version: CURRENT_VERSION, project }, null, space)

/**
 * The only way untrusted text becomes a `Project`: checks the envelope, migrates old
 * versions, then sanitizes. Never throws; problems come back as `error` or `warnings`.
 */
export const parseProject = (text: string): ParseResult => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('The file is not valid JSON.')
  }

  if (!isRecord(data) || data.format !== FORMAT) return fail('This is not an SFX Lab project file.')

  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('The file has no valid format version.')
  }
  if (version > CURRENT_VERSION) {
    return fail(
      `The file was saved by a newer version of SFX Lab (format v${version}); this version reads up to v${CURRENT_VERSION}.`,
    )
  }

  let migrated: unknown
  try {
    migrated = migrate(data.project, version)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The project could not be upgraded.')
  }

  const warnings: string[] = []
  const project = sanitizeProject(migrated, (message) => warnings.push(message))
  return project ? { ok: true, project, warnings } : fail('The file contains no project data.')
}
