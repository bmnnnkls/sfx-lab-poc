import { describe, expect, it } from 'vitest'
import { type MixChannel, mixState } from './mix-state'

type Spec = Partial<Omit<MixChannel, 'id'>>

/** Channels by id; a name starting with R is a return, with B a bus, anything else a track. */
const channels = (specs: Record<string, Spec>): MixChannel[] =>
  Object.entries(specs).map(([id, spec]) => ({
    id,
    kind: id.startsWith('R') ? 'return' : id.startsWith('B') ? 'bus' : 'track',
    muted: false,
    soloed: false,
    output: null,
    sends: [],
    ...spec,
  }))

const heard = (specs: Record<string, Spec>) => [...mixState(channels(specs)).heard].sort().join(' ')
const blocked = (specs: Record<string, Spec>, id: string) => [...mixState(channels(specs)).blocked.get(id)!].sort().join(' ')

describe('mixState', () => {
  it.each<[string, Record<string, Spec>, string]>([
    ['no solo: all but the muted', { a: {}, b: { muted: true }, R1: {}, B1: { muted: true } }, 'R1 a'],
    ['solo: only the soloed', { a: { soloed: true }, b: {} }, 'a'],
    ['solo wins over mute on the same channel', { a: { soloed: true, muted: true }, b: {} }, 'a'],
    ['a soloed member keeps its bus', { a: { soloed: true, output: 'B1' }, b: { output: 'B1' }, B1: {}, c: {} }, 'B1 a'],
    ['and the bus around that bus, through a folder', { a: { soloed: true, output: 'B1' }, B1: { output: 'B2' }, B2: {}, B3: {} }, 'B1 B2 a'],
    ['a muted bus stays muted', { a: { soloed: true, output: 'B1' }, B1: { muted: true } }, 'a'],
    ['a soloed group: its members and its bus', { a: { soloed: true, output: 'B1' }, b: { soloed: true, output: 'B1' }, B1: { soloed: true }, c: {} }, 'B1 a b'],
    ['a soloed member keeps its reverb', { a: { soloed: true, sends: ['R1'] }, R1: {}, R2: {} }, 'R1 a'],
    ['a bus fed by a soloed member keeps the reverb it sends to', { a: { soloed: true, output: 'B1' }, B1: { sends: ['R1'] }, R1: {} }, 'B1 R1 a'],
    ['a muted return stays muted', { a: { soloed: true, sends: ['R1'] }, R1: { muted: true } }, 'a'],
    ['returns deep', { a: { soloed: true, sends: ['R1'] }, R1: { sends: ['R2'] }, R2: {} }, 'R1 R2 a'],
    ['a soloed return, alone', { a: { sends: ['R1'] }, R1: { soloed: true } }, 'R1'],
  ])('%s', (_, specs, expected) => {
    expect(heard(specs)).toBe(expected)
  })

  it('closes a muted channel\'s sends, and a muted member\'s, wherever it sums', () => {
    expect(blocked({ a: { muted: true, output: 'B1', sends: ['R1'] }, B1: {}, R1: {} }, 'a')).toBe('R1')
    expect(blocked({ a: { output: 'B1', sends: ['R1'] }, B1: { muted: true }, R1: {} }, 'a')).toBe('')
  })

  it('under solo, keeps a member\'s sends to a soloed return, but its bus hears nothing from it', () => {
    const specs: Record<string, Spec> = { a: { output: 'B1', sends: ['R1'] }, B1: { sends: ['R1'] }, R1: { soloed: true } }
    expect(blocked(specs, 'a')).toBe('')
    expect(blocked(specs, 'B1')).toBe('')
    expect(heard(specs)).toBe('R1')
  })

  it('blocks the sends of a channel that is soloed out', () => {
    expect(blocked({ a: { soloed: true }, b: { sends: ['R1'] }, B1: { sends: ['R1'] }, R1: {} }, 'b')).toBe('R1')
    expect(blocked({ a: { soloed: true }, b: { sends: ['R1'] }, B1: { sends: ['R1'] }, R1: {} }, 'B1')).toBe('R1')
  })

  it('opens a soloed member\'s sends from a muted bus group', () => {
    const specs: Record<string, Spec> = { a: { soloed: true, muted: true, output: 'B1', sends: ['R1'] }, B1: { muted: true }, R1: {} }
    expect(heard(specs)).toBe('R1 a')
    expect(blocked(specs, 'a')).toBe('')
  })
})
