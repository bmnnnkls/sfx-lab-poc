import { type ModuleLibrary, type PortRef, type Patch, describeNode, nodeTitles } from '@core'
import { useMemo, useState } from 'react'
import styles from './panel.module.css'

export type AddKind = 'knob' | 'slider' | 'slider-horizontal' | 'xy' | 'switch' | 'selector'

export interface AddDraft {
  readonly kind: AddKind
  /** The parameter it will drive (the x axis of a pad); none: a blank control, to be wired in the graph. */
  readonly x?: PortRef
  readonly y?: PortRef
}

interface Choice {
  readonly id: string
  readonly text: string
  readonly ref: PortRef
}

const pack = (ref: PortRef): string => `${ref.node}\u0000${ref.port}`

/**
 * A small form: what kind of control, and optionally the parameter it should drive (a pad takes two). The control is a
 * node: with a parameter it is made and wired to it, without one it is a blank control to wire in the graph.
 */
export const AddControl = ({ patch, modules, onAdd }: { patch: Patch; modules: ModuleLibrary; onAdd(draft: AddDraft): void }) => {
  // The parameters a control can be made for: numbers with a socket and nothing wired to it yet.
  const choices = useMemo<Choice[]>(() => {
    const titles = nodeTitles(patch, modules)
    return patch.nodes.flatMap((node) => {
      const shape = describeNode(node, modules)
      return (shape?.params ?? [])
        .filter((spec) => spec.options === undefined && shape?.inputs.some((port) => port.param === spec.id))
        .filter((spec) => !patch.connections.some((c) => c.to.node === node.id && c.to.port === `param:${spec.id}`))
        .map((spec) => ({ id: pack({ node: node.id, port: spec.id }), text: `${titles.get(node.id) ?? node.type}: ${spec.label}`, ref: { node: node.id, port: spec.id } }))
    })
  }, [patch, modules])

  const [kind, setKind] = useState<AddKind>('knob')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const x = choices.find((choice) => choice.id === first)
  const y = choices.find((choice) => choice.id === second)
  // A pad with one parameter chosen would be half wired: ask for both or neither.
  const blank = kind === 'switch' || kind === 'selector'
  const ready = blank || (kind === 'xy' ? (x === undefined) === (y === undefined) && (x === undefined || x.id !== y?.id) : true)

  return (
    <form
      className={styles.addForm}
      aria-label="Add a control"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        onAdd({ kind, ...(blank || !x ? {} : { x: x.ref }), ...(kind === 'xy' && y ? { y: y.ref } : {}) })
        setFirst('')
        setSecond('')
      }}
    >
      <select aria-label="Control type" value={kind} onChange={(event) => setKind(event.target.value as AddKind)}>
        <option value="knob">Knob</option>
        <option value="slider">Slider</option>
        <option value="slider-horizontal">Slider, sideways</option>
        <option value="xy">XY pad</option>
        <option value="switch">Switch</option>
        <option value="selector">Selector</option>
      </select>
      {!blank && (
        <select aria-label="Parameter" value={first} onChange={(event) => setFirst(event.target.value)}>
          <option value="">{kind === 'xy' ? 'X parameter (or none)…' : 'Parameter (or none)…'}</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.text}
            </option>
          ))}
        </select>
      )}
      {kind === 'xy' && (
        <select aria-label="Y parameter" value={second} onChange={(event) => setSecond(event.target.value)}>
          <option value="">Y parameter…</option>
          {choices
            .filter((choice) => choice.id !== first)
            .map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.text}
              </option>
            ))}
        </select>
      )}
      <button type="submit" disabled={!ready}>
        Add
      </button>
    </form>
  )
}
