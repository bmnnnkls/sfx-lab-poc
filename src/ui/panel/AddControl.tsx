import { type ControlDraft, type ControlKind, type ModuleLibrary, type ParamBinding, type Patch, controlFits, describeNode } from '@core'
import { useMemo, useState } from 'react'
import styles from './panel.module.css'
import { nodeTitles } from './panel-values'

interface Choice {
  readonly id: string
  readonly text: string
  readonly binding: ParamBinding
  readonly enumerated: boolean
}

const pack = (binding: ParamBinding): string => `${binding.node}\u0000${binding.param}`

/** A small form: pick a parameter (and a second one for a pad), then what to draw it as. */
export const AddControl = ({ patch, modules, onAdd }: { patch: Patch; modules: ModuleLibrary; onAdd(draft: ControlDraft): void }) => {
  const choices = useMemo<Choice[]>(() => {
    const titles = nodeTitles(patch, modules)
    return patch.nodes.flatMap((node) =>
      (describeNode(node, modules)?.params ?? []).map((spec) => ({
        id: pack({ node: node.id, param: spec.id }),
        text: `${titles.get(node.id) ?? node.type}: ${spec.label}`,
        binding: { node: node.id, param: spec.id },
        enumerated: spec.options !== undefined,
      })),
    )
  }, [patch, modules])

  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [kind, setKind] = useState<Exclude<ControlKind, 'selector'>>('knob')

  const chosen = choices.find((choice) => choice.id === first)
  const chosenY = choices.find((choice) => choice.id === second)
  const shown: ControlKind = chosen?.enumerated ? 'selector' : kind
  const draft: ControlDraft | undefined = chosen
    ? { kind: shown, bind: chosen.binding, ...(shown === 'xy' && chosenY ? { bindY: chosenY.binding } : {}) }
    : undefined
  const ready = draft !== undefined && controlFits(patch, modules, draft)

  if (choices.length === 0) return <span className={styles.hint}>Add nodes with parameters first.</span>

  return (
    <form
      className={styles.addForm}
      aria-label="Add a control"
      onSubmit={(event) => {
        event.preventDefault()
        if (draft && ready) {
          onAdd(draft)
          setFirst('')
          setSecond('')
        }
      }}
    >
      <select aria-label="Parameter" value={first} onChange={(event) => setFirst(event.target.value)}>
        <option value="">Parameter…</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.text}
          </option>
        ))}
      </select>
      <select
        aria-label="Control type"
        value={shown}
        disabled={chosen?.enumerated === true}
        onChange={(event) => setKind(event.target.value as Exclude<ControlKind, 'selector'>)}
      >
        <option value="knob">Knob</option>
        <option value="slider">Slider</option>
        <option value="xy">XY pad</option>
        {chosen?.enumerated && <option value="selector">Selector</option>}
      </select>
      {shown === 'xy' && (
        <select aria-label="Y parameter" value={second} onChange={(event) => setSecond(event.target.value)}>
          <option value="">Y parameter…</option>
          {choices
            .filter((choice) => !choice.enumerated && choice.id !== first)
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
