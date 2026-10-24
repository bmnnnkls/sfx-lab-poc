import type { NoteEvent, NoteIdentity, NoteScope } from './types'

export const noteKey = (event: { readonly pitch: number; readonly identity?: NoteIdentity }): string =>
  event.identity ? JSON.stringify([event.identity.source, event.identity.channel, event.identity.id, event.identity.path ?? []]) : String(event.pitch)

export const inNoteScope = (identity: NoteIdentity | undefined, scope?: NoteScope): boolean =>
  !scope || (!!identity && identity.source === scope.source && (scope.channel === undefined || identity.channel === scope.channel))

/** Deterministic child identity for transformed and generated events. */
export const childIdentity = (identity: NoteIdentity | undefined, child: string | number): { identity?: NoteIdentity } =>
  identity ? { identity: { ...identity, path: [...(identity.path ?? []), child] } } : {}

export const eventInScope = (event: NoteEvent, scope?: NoteScope): boolean =>
  event.kind !== 'allOff' && inNoteScope(event.identity, scope)
