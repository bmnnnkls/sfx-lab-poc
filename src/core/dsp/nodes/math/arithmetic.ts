import { mathNode } from './math-node'

const A = { id: 'a', label: 'A' }
const B = { id: 'b', label: 'B' }

export const addNode = mathNode({
  type: 'add',
  label: 'Add',
  operands: [{ ...A, default: 0 }, { ...B, default: 0 }],
  make: () => (a, b) => a + b,
})

export const multiplyNode = mathNode({
  type: 'multiply',
  label: 'Multiply',
  operands: [{ ...A, default: 1 }, { ...B, default: 1 }],
  make: () => (a, b) => a * b,
})

export const invertNode = mathNode({
  type: 'invert',
  label: 'Invert',
  operands: [{ id: 'in', label: 'In', default: 0 }],
  make: () => (a) => -a,
})

export const minNode = mathNode({
  type: 'min',
  label: 'Min',
  operands: [{ ...A, default: 0 }, { ...B, default: 0 }],
  make: () => (a, b) => Math.min(a, b),
})

export const maxNode = mathNode({
  type: 'max',
  label: 'Max',
  operands: [{ ...A, default: 0 }, { ...B, default: 0 }],
  make: () => (a, b) => Math.max(a, b),
})

export const clampNode = mathNode({
  type: 'clamp',
  label: 'Clamp',
  operands: [{ id: 'in', label: 'In', default: 0 }],
  extra: [
    { id: 'min', label: 'Min', min: -100000, max: 100000, default: 0 },
    { id: 'max', label: 'Max', min: -100000, max: 100000, default: 1 },
  ],
  // Reversed limits are swapped rather than refused, so a typo cannot make the output jump.
  make: (params) => (a) => Math.min(Math.max(params.get('min'), params.get('max')), Math.max(Math.min(params.get('min'), params.get('max')), a)),
})

export const compareNode = mathNode({
  type: 'compare',
  label: 'Compare',
  operands: [{ ...A, default: 0 }, { id: 'b', label: 'Threshold', default: 0.5 }],
  make: () => (a, b) => (a > b ? 1 : 0),
})
