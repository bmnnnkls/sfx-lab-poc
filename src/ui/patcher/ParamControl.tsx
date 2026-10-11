import type { ParamSpec } from '@core'
import { paramTooltip } from '../shared/tooltip/tooltip-text'
import { formatParam, fromSlider, snapToStep, toSlider } from '../shared/param-scale'
import styles from './Patcher.module.css'

interface ParamControlProps {
  spec: ParamSpec
  value: number
  /** What is wired into the parameter's socket, if anything: the wire replaces the stored value, so there is nothing to set here. */
  drivenBy?: string
  onChange(value: number): void
}

const SLIDER_RESOLUTION = 1000

export const ParamControl = ({ spec, value, drivenBy, onChange }: ParamControlProps) => (
  <label className={styles.param} data-tooltip={paramTooltip(spec, drivenBy)} data-driven={drivenBy !== undefined}>
    <span className={styles.paramLabel}>
      {spec.label}
      <span className={styles.paramValue}>{formatParam(spec, value)}</span>
    </span>
    {spec.options ? (
      <select disabled={drivenBy !== undefined} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))}>
        {spec.options.map((option, index) => (
          <option key={option} value={index}>
            {option}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="range"
        disabled={drivenBy !== undefined}
        min={0}
        max={SLIDER_RESOLUTION}
        value={Math.round(toSlider(spec, value) * SLIDER_RESOLUTION)}
        onChange={(event) =>
          onChange(snapToStep(spec, fromSlider(spec, Number(event.target.value) / SLIDER_RESOLUTION)))
        }
      />
    )}
  </label>
)
