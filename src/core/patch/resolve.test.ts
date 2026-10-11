import { describe, expect, it } from 'vitest'
import { type Patch, noteGraphFrom, resolveParams } from '.'

const patchOf = (nodes: Parameters<typeof noteGraphFrom>[0], wires: string[]): Patch => noteGraphFrom(nodes, wires)

describe('resolveParams', () => {
  it('a node with nothing wired has its stored values', () => {
    const patch = patchOf([{ id: 'f', type: 'filter', params: { cutoff: 900 } }], [])
    expect(resolveParams(patch, 'f')).toMatchObject({ values: { cutoff: 900 }, moving: new Set() })
  })

  it('a wire from a control replaces the stored value with the control\'s value', () => {
    const patch = patchOf(
      [{ id: 'f', type: 'filter', params: { cutoff: 900 } }, { id: 'k', type: 'control', params: { value: 440, min: 20, max: 20000 } }],
      ['k.out>f.param:cutoff'],
    )
    expect(resolveParams(patch, 'f').values.cutoff).toBe(440)
  })

  it('uses the control after its own step and clamp, and the parameter\'s own range, as the engine does', () => {
    const patch = patchOf(
      [{ id: 'f', type: 'filter' }, { id: 'k', type: 'control', params: { value: 5000, min: 0, max: 100, step: 7 } }],
      ['k.out>f.param:cutoff'],
    )
    expect(resolveParams(patch, 'f').values.cutoff).toBe(100) // snapped to 4998 first, then held at the control's max
  })

  it('works through math nodes: a MIDI note control into MIDI to Hz into a frequency', () => {
    const patch = patchOf(
      [
        { id: 'o', type: 'oscillator' },
        { id: 'k', type: 'control', params: { value: 69, min: 0, max: 127, step: 1 } },
        { id: 'm', type: 'midiToHz' },
      ],
      ['k.out>m.note', 'm.out>o.param:frequency'],
    )
    expect(resolveParams(patch, 'o').values.frequency).toBeCloseTo(440, 3)
  })

  it('works through a socket on the math node too (the second operand a control)', () => {
    const patch = patchOf(
      [{ id: 'a', type: 'add', params: { a: 1 } }, { id: 'k', type: 'control', params: { value: 2 } }, { id: 'g', type: 'gain' }],
      ['k.out>a.param:b', 'a.out>g.param:gain'],
    )
    expect(resolveParams(patch, 'g').values.gain).toBe(2) // add: a (1) + b (2) = 3, clamped by the gain's range 0..2
  })

  it('a value outside the parameter\'s range is held inside it', () => {
    const patch = patchOf([{ id: 'f', type: 'filter' }, { id: 'k', type: 'control', params: { value: 50000, min: 0, max: 100000 } }], ['k.out>f.param:cutoff'])
    expect(resolveParams(patch, 'f').values.cutoff).toBe(20000)
  })

  it('a pad drives two parameters, each from its own axis; a switch gives 0 or 1', () => {
    const patch = patchOf(
      [
        { id: 'f', type: 'filter' },
        { id: 'p', type: 'xyPad', params: { x: 1000, xMin: 20, xMax: 20000, y: 5, yMin: 0.1, yMax: 20 } },
        { id: 's', type: 'switch', params: { on: 1 } },
        { id: 'g', type: 'gain' },
      ],
      ['p.x>f.param:cutoff', 'p.y>f.param:resonance', 's.out>g.param:gain'],
    )
    expect(resolveParams(patch, 'f').values).toMatchObject({ cutoff: 1000, resonance: 5 })
    expect(resolveParams(patch, 'g').values.gain).toBe(1)
  })

  it('several wires add up', () => {
    const patch = patchOf(
      [{ id: 'g', type: 'gain' }, { id: 'a', type: 'control', params: { value: 0.25 } }, { id: 'b', type: 'control', params: { value: 0.5 } }],
      ['a.out>g.param:gain', 'b.out>g.param:gain'],
    )
    expect(resolveParams(patch, 'g').values.gain).toBeCloseTo(0.75, 6)
  })

  it('something that moves cannot be resolved: the stored value stays and the parameter is listed as moving', () => {
    const patch = patchOf([{ id: 'f', type: 'filter', params: { cutoff: 900 } }, { id: 'l', type: 'lfo' }], ['l.out>f.param:cutoff'])
    const resolved = resolveParams(patch, 'f')
    expect(resolved.values.cutoff).toBe(900)
    expect([...resolved.moving]).toEqual(['cutoff'])
  })

  it('math on something that moves is moving too, however deep', () => {
    const patch = patchOf(
      [{ id: 'f', type: 'filter' }, { id: 'l', type: 'lfo' }, { id: 'a', type: 'add' }, { id: 'm', type: 'multiply' }],
      ['l.out>a.a', 'a.out>m.a', 'm.out>f.param:cutoff'],
    )
    expect([...resolveParams(patch, 'f').moving]).toEqual(['cutoff'])
  })

  it('an unknown node gives nothing, and a node whose parameter is not wired is untouched by other wires', () => {
    expect(resolveParams(patchOf([], []), 'nope')).toEqual({ values: {}, moving: new Set() })
    const patch = patchOf([{ id: 'f', type: 'filter', params: { resonance: 3 } }, { id: 'k', type: 'control', params: { value: 0.5 } }], ['k.out>f.param:cutoff'])
    expect(resolveParams(patch, 'f').values.resonance).toBe(3)
  })
})
