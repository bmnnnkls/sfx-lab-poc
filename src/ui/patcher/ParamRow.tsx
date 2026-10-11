import { formatParam, fromSlider, snapToStep, toSlider } from '../shared/param-scale'
import { paramTooltip } from '../shared/tooltip/tooltip-text'
import { NumberField } from './NumberField'
import { type PropertyRow, clampToSpec, showsSlider } from './property-rows'
import styles from './PropertyEditor.module.css'

const SLIDER_RESOLUTION = 1000

interface ParamRowProps {
  row: PropertyRow
  onChange(value: number): void
  onCreateControl(display: 'knob' | 'slider'): void
  onUnwire(): void
}

/** One parameter in the property editor: its label, a field and a slider (or a choice), reset, and what drives it. */
export const ParamRow = ({ row, onChange, onCreateControl, onUnwire }: ParamRowProps) => {
  const { spec, value, drivenBy } = row
  const driven = drivenBy !== undefined
  return (
    <div className={styles.row} data-param={spec.id} data-driven={driven} data-tooltip={paramTooltip(spec, drivenBy)}>
      <span className={styles.rowLabel}>{spec.label}</span>
      {spec.options ? (
        <select aria-label={spec.label} value={Math.round(value)} disabled={driven} onChange={(event) => onChange(Number(event.target.value))}>
          {spec.options.map((option, index) => (
            <option key={option} value={index}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <div className={styles.rowControl}>
          <NumberField className={styles.number} label={`${spec.label} value`} value={value} disabled={driven} onChange={(next) => onChange(clampToSpec(spec, next))} />
          {spec.unit && spec.format !== 'midiNote' && <span className={styles.unit}>{spec.unit}</span>}
          {spec.format === 'midiNote' && <span className={styles.unit}>{formatParam(spec, value)}</span>}
          {showsSlider(spec) && (
            <input
              type="range"
              className={styles.slider}
              aria-label={spec.label}
              min={0}
              max={SLIDER_RESOLUTION}
              disabled={driven}
              value={Math.round(Math.min(1, Math.max(0, toSlider(spec, Math.min(spec.max, Math.max(spec.min, value))))) * SLIDER_RESOLUTION)}
              onChange={(event) => onChange(clampToSpec(spec, snapToStep(spec, fromSlider(spec, Number(event.target.value) / SLIDER_RESOLUTION))))}
            />
          )}
        </div>
      )}
      <div className={styles.rowActions}>
        {driven ? (
          <>
            <span className={styles.drivenBy}>Driven by {drivenBy}</span>
            <button type="button" onClick={onUnwire} aria-label={`Unwire ${spec.label}`} data-tooltip="Remove the wire; the parameter uses its own value again.">
              Unwire
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={value === row.resetTo}
              onClick={() => onChange(row.resetTo)}
              aria-label={`Reset ${spec.label}`}
              data-tooltip="Back to the default value."
            >
              ↺
            </button>
            {row.hasSocket && (
              <>
                <button type="button" onClick={() => onCreateControl('knob')} aria-label={`Create knob for ${spec.label}`} data-tooltip="Add a knob wired to this parameter.">
                  Knob
                </button>
                <button type="button" onClick={() => onCreateControl('slider')} aria-label={`Create slider for ${spec.label}`} data-tooltip="Add a slider wired to this parameter.">
                  Slider
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
