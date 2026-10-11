import type { ParamSpec } from '@core'
import { formatParam, fromSlider, snapToStep, toSlider } from '../shared/param-scale'
import styles from './Patcher.module.css'

interface ParamControlProps {
  spec: ParamSpec
  value: number
  /** A wire into the parameter's socket replaces the stored value, so there is nothing to set here. */
  driven?: boolean
  onChange(value: number): void
}

const SLIDER_RESOLUTION = 1000

export const ParamControl = ({ spec, value, driven = false, onChange }: ParamControlProps) => (
  <label className={styles.param} title={driven ? 'Driven by a wire: the wire replaces this value' : undefined} data-driven={driven}>
    <span className={styles.paramLabel}>
      {spec.label}
      <span className={styles.paramValue}>{formatParam(spec, value)}</span>
    </span>
    {spec.options ? (
      <select disabled={driven} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))}>
        {spec.options.map((option, index) => (
          <option key={option} value={index}>
            {option}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="range"
        disabled={driven}
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
