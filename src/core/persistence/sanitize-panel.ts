import {
  CONTROL_KINDS,
  CONTROL_SIZES,
  type ControlKind,
  type ControlSize,
  type ModuleLibrary,
  type PanelControl,
  type Patch,
  type ParamBinding,
  controlFits,
  defaultControlLabel,
  defaultControlSize,
} from '../patch'
import { createId } from '../shared'
import { LIMITS } from './format'
import { type Raw, type Warn, asList, isRecord } from './raw'

const MAX_LABEL = 80

const readBinding = (raw: unknown): ParamBinding | undefined =>
  isRecord(raw) && typeof raw.node === 'string' && typeof raw.param === 'string' ? { node: raw.node, param: raw.param } : undefined

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  allowed.find((candidate) => candidate === value)

/**
 * Reads a patch's front panel from untrusted data, after its nodes are in. A control survives only when its kind is known
 * and its parameters exist in this patch and suit the kind (the same test the editor applies), so a stale or hostile
 * file cannot make the panel draw something that is not there. Anything else is dropped and counted in one warning.
 */
export const sanitizePanel = (raw: unknown, patch: Patch, modules: ModuleLibrary, where: string, warn: Warn): PanelControl[] => {
  const list = asList(raw)
  if (list.length > LIMITS.controlsPerPatch) warn(`${where}: only the first ${LIMITS.controlsPerPatch} panel controls were kept`)

  const ids = new Set<string>()
  const controls: PanelControl[] = []
  let dropped = 0
  for (const item of list.slice(0, LIMITS.controlsPerPatch)) {
    const source: Raw = isRecord(item) ? item : {}
    const kind: ControlKind | undefined = oneOf(CONTROL_KINDS, source.kind)
    const bind = readBinding(source.bind)
    const bindY = readBinding(source.bindY)
    if (!kind || !bind || !controlFits(patch, modules, { kind, bind, ...(bindY ? { bindY } : {}) })) {
      dropped++
      continue
    }
    const size: ControlSize = oneOf(CONTROL_SIZES, source.size) ?? defaultControlSize(kind)
    const label =
      typeof source.label === 'string' && source.label.trim() !== ''
        ? source.label.trim().slice(0, MAX_LABEL)
        : defaultControlLabel(patch, modules, { bind, ...(kind === 'xy' && bindY ? { bindY } : {}) })
    // A repeated or missing id would make two controls one in the editor: the second gets a fresh one.
    const id = typeof source.id === 'string' && source.id !== '' && !ids.has(source.id) ? source.id : createId('control')
    ids.add(id)
    controls.push({
      id,
      kind,
      label,
      bind,
      ...(kind === 'xy' && bindY ? { bindY } : {}),
      size,
      ...(kind === 'slider' && source.orientation === 'horizontal' ? { orientation: 'horizontal' as const } : {}),
    })
  }
  if (dropped > 0) warn(`${where}: dropped ${dropped} panel control(s) that did not fit the patch`)
  return controls
}
