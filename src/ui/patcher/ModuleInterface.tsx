import {
  type ModuleDefinition,
  type ModuleKnob,
  type ModulePort,
  describeNode,
  exposeKnob,
  exposePort,
  exposedKnobId,
  exposedPortId,
  hideKnob,
  hidePort,
  labelKnob,
  moduleControls,
  nodeTitles,
  labelPort,
} from '@core'
import { useProjectStore } from '@state'
import styles from './Patcher.module.css'

/** One checkbox row: tick to expose, and name it once exposed. */
const InterfaceRow = ({
  kind,
  label,
  defaultLabel,
  exposed,
  onToggle,
  onRename,
  testId,
}: {
  kind: string
  label: string
  defaultLabel: string
  exposed: ModulePort | ModuleKnob | undefined
  onToggle(on: boolean): void
  onRename(label: string): void
  testId: string
}) => (
  <div className={styles.interfaceRow}>
    <input
      type="checkbox"
      checked={exposed !== undefined}
      aria-label={`Show ${label} on the module`}
      data-testid={testId}
      onChange={(event) => onToggle(event.target.checked)}
    />
    {exposed ? (
      <input
        type="text"
        value={exposed.label}
        aria-label={`Name of ${label}`}
        onChange={(event) => onRename(event.target.value || defaultLabel)}
      />
    ) : (
      <span>
        {label} <span className={styles.interfaceKind}>{kind}</span>
      </span>
    )}
  </div>
)

/**
 * Chooses which inner ports and parameters a module shows on the outside. Every use of the module gets
 * the inputs, outputs and knobs ticked here.
 */
export const ModuleInterface = ({ definition }: { definition: ModuleDefinition }) => {
  const modules = useProjectStore((state) => state.project.modules)
  const updateModule = useProjectStore((state) => state.updateModule)
  const change = (edit: (module: ModuleDefinition) => ModuleDefinition, key: string) =>
    updateModule(definition.id, edit, `module-interface:${definition.id}:${key}`)

  const counts = new Map<string, number>()
  const controls = moduleControls(definition)
  const innerTitles = nodeTitles(definition.patch, modules)
  return (
    <aside className={styles.interface} aria-label="Module ports and knobs" data-testid="module-interface">
      <h4>Shown on the module</h4>
      <p className={styles.selectionHint} data-testid="module-controls">
        {controls.length === 0
          ? 'Control nodes inside the module are shown on the panel of the graph that uses it (none yet).'
          : `On the panel of the graph that uses it: ${controls.map(({ node }) => innerTitles.get(node.id)).join(', ')}. Each use keeps its own values; untick Show on panel on a control to leave it off.`}
      </p>
      {definition.patch.nodes.map((node) => {
        const shape = describeNode(node, modules)
        if (!shape) return null
        const index = (counts.get(shape.label) ?? 0) + 1
        counts.set(shape.label, index)
        const title = index > 1 ? `${shape.label} ${index}` : shape.label
        return (
          <div key={node.id} className={styles.interfaceNode} data-testid={`interface-${node.id}`}>
            <strong>{title}</strong>
            {shape.inputs.map((port) => {
              const ref = { node: node.id, port: port.id }
              const exposed = definition.inputs.find((candidate) => candidate.id === exposedPortId(ref))
              return (
                <InterfaceRow
                  key={`in-${port.id}`}
                  kind={port.param === undefined ? 'input' : 'socket'}
                  label={port.label}
                  defaultLabel={port.label}
                  exposed={exposed}
                  testId={`expose-in-${node.id}-${port.id}`}
                  onToggle={(on) =>
                    change((module) => (on ? exposePort(module, 'inputs', ref, port.label) : hidePort(module, 'inputs', exposedPortId(ref))), `in:${node.id}:${port.id}`)
                  }
                  onRename={(label) => change((module) => labelPort(module, 'inputs', exposedPortId(ref), label), `in-label:${node.id}:${port.id}`)}
                />
              )
            })}
            {shape.outputs.map((port) => {
              const ref = { node: node.id, port: port.id }
              const exposed = definition.outputs.find((candidate) => candidate.id === exposedPortId(ref))
              return (
                <InterfaceRow
                  key={`out-${port.id}`}
                  kind="output"
                  label={port.label}
                  defaultLabel={port.label}
                  exposed={exposed}
                  testId={`expose-out-${node.id}-${port.id}`}
                  onToggle={(on) =>
                    change((module) => (on ? exposePort(module, 'outputs', ref, port.label) : hidePort(module, 'outputs', exposedPortId(ref))), `out:${node.id}:${port.id}`)
                  }
                  onRename={(label) => change((module) => labelPort(module, 'outputs', exposedPortId(ref), label), `out-label:${node.id}:${port.id}`)}
                />
              )
            })}
            {shape.params.map((spec) => {
              const exposed = definition.knobs.find((candidate) => candidate.id === exposedKnobId(node.id, spec.id))
              return (
                <InterfaceRow
                  key={`knob-${spec.id}`}
                  kind="knob"
                  label={spec.label}
                  defaultLabel={spec.label}
                  exposed={exposed}
                  testId={`expose-knob-${node.id}-${spec.id}`}
                  onToggle={(on) =>
                    change(
                      (module) => (on ? exposeKnob(module, node.id, spec.id, spec.label) : hideKnob(module, exposedKnobId(node.id, spec.id))),
                      `knob:${node.id}:${spec.id}`,
                    )
                  }
                  onRename={(label) => change((module) => labelKnob(module, exposedKnobId(node.id, spec.id), label), `knob-label:${node.id}:${spec.id}`)}
                />
              )
            })}
          </div>
        )
      })}
      {definition.patch.nodes.length === 0 && <p className={styles.selectionHint}>Add nodes to the module first.</p>}
    </aside>
  )
}
