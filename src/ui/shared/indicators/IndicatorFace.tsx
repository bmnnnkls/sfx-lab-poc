import type { PatchNode } from '@core'
import { useStatusStore } from '@state'
import { barFill, displayText, ledLook } from './indicator-values'
import styles from './indicators.module.css'

/** The value an indicator node is showing, as the engine last reported it: `undefined` when it is not reporting (nothing sounds, not running, or no track). */
export const useReadout = (track: string | undefined, nodeId: string): number | undefined =>
  useStatusStore((state) => (track === undefined ? undefined : state.status?.readouts?.[track]?.[nodeId]))

/** The kinds of indicator (`NodeDefinition.panelKind`). */
export type IndicatorKind = 'led' | 'display' | 'bar'

interface IndicatorFaceProps {
  node: Pick<PatchNode, 'id' | 'params' | 'unit'>
  kind: IndicatorKind
  /** What it is called (the node's name, or its type numbered when alike). */
  label: string
  /** The track whose engine reports the value (`master` for the master bus); absent where there is no live value (inside a module). */
  track: string | undefined
  /** On a card the name is the card's title already. */
  showLabel?: boolean
}

/** An LED, a number or a bar showing the live value of an indicator node. The same face sits on a card and on the front panel. */
export const IndicatorFace = ({ node, kind, label, track, showLabel = true }: IndicatorFaceProps) => {
  const value = useReadout(track, node.id)
  const text = displayText(node, value)
  return (
    <div className={styles.face} data-testid={`indicator-${node.id}`}>
      {kind === 'led' && (() => {
        const look = ledLook(node, value)
        return <div className={styles.led} role="img" aria-label={`${label}: ${look.lit ? 'on' : 'off'}`} data-lit={look.lit} data-colour={look.colour} style={{ ['--glow' as string]: look.brightness }} />
      })()}
      {kind === 'display' && (
        <output className={styles.number} aria-label={label} data-empty={value === undefined || undefined}>
          {text}
        </output>
      )}
      {kind === 'bar' && (
        <div className={styles.bar} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={barFill(node, value)} aria-valuetext={text}>
          <div className={styles.barFill} style={{ width: `${barFill(node, value) * 100}%` }} />
        </div>
      )}
      {showLabel && <span className={styles.label}>{label}</span>}
    </div>
  )
}
