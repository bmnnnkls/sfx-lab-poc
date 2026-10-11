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

export const subtractNode = mathNode({
  type: 'subtract',
  label: 'Subtract',
  operands: [{ ...A, default: 0 }, { ...B, default: 0 }],
  make: () => (a, b) => a - b,
})

/** Dividing by zero gives 0, not Infinity: a control that is dragged through 0 must not blow the sound up. */
export const divideNode = mathNode({
  type: 'divide',
  label: 'Divide',
  operands: [{ ...A, default: 1 }, { ...B, default: 1 }],
  make: () => (a, b) => (b === 0 ? 0 : a / b),
})

export const absNode = mathNode({
  type: 'abs',
  label: 'Abs',
  operands: [{ id: 'in', label: 'In', default: 0 }],
  make: () => (a) => Math.abs(a),
})

/** A fixed value: the same as a control nobody turns, as a node a patch can read like a number. */
export const constantNode = mathNode({
  type: 'constant',
  label: 'Constant',
  operands: [],
  extra: [{ id: 'value', label: 'Value', min: -100000, max: 100000, default: 1 }],
  make: (params) => () => params.get('value'),
})
