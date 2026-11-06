import { type ControlTarget, type ExpressionTarget, ccLabel, controlTargetKey, expressionTarget, isExpressionCC } from '@core'
import { useState } from 'react'
import styles from './CcLaneField.module.css'

/**
 * *CC…*: a lane for any CC an instrument track's list doesn't offer, by number (0 to 119, not 64), with its common name
 * as the hint. A CC that already has a lane can't be added again.
 */
export const CcLaneField = ({ trackId, lanes, onAdd, disabled = false }: { trackId: string; lanes: readonly { readonly target: ControlTarget }[]; onAdd: (target: ExpressionTarget) => void; disabled?: boolean }) => {
  const [text, setText] = useState('')
  const cc = text.trim() === '' ? NaN : Number(text)
  const valid = isExpressionCC(cc)
  const target = valid ? expressionTarget(trackId, { cc }) : undefined
  const taken = !!target && lanes.some((lane) => controlTargetKey(lane.target) === controlTargetKey(target))
  const reason = !text.trim() ? 'Type a CC number' : !valid ? 'A CC lane takes 0 to 119, but not 64 (the sustain pedal)' : taken ? `CC ${ccLabel(cc)} already has a lane` : `Add a lane for CC ${ccLabel(cc)}`
  const add = () => {
    if (!target || taken || disabled) return
    onAdd(target)
    setText('')
  }
  return (
    <span className={styles.field} role="group" aria-label="Lane for a CC by number">
      <label>
        CC…
        <input
          aria-label="CC number"
          type="number"
          min={0}
          max={119}
          step={1}
          placeholder="0–119"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
        />
      </label>
      <button disabled={!target || taken || disabled} title={disabled ? 'This clip has no room for another lane' : reason} onClick={add}>
        {valid ? `Add CC ${ccLabel(cc)}` : 'Add CC'}
      </button>
    </span>
  )
}
