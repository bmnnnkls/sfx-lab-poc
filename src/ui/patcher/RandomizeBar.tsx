import { useState } from 'react'
import styles from './Patcher.module.css'

/** How far a mutation may move each setting, as a part of its range. */
const MUTATE_AMOUNTS = [
  { value: 0.05, label: 'a touch' },
  { value: 0.15, label: 'some' },
  { value: 0.3, label: 'a lot' },
] as const

const newSeed = (): number => Math.floor(Math.random() * 10000)

interface RandomizeBarProps {
  /** Re-rolls the settings of the graph on show; `amount` is 1 for a full roll. One undo step. */
  onRoll(seed: number, amount: number): void
}

/**
 * Randomize (every unlocked setting anywhere in its range) and Mutate (a nudge), from a seed. The seed shown is the one the next
 * press uses; after a press it moves on, and the one just used is kept beside it, so a result worth keeping can be got back by
 * typing its number. Locked nodes (a checkbox in the property editor), controls' ranges and wired settings are left alone.
 */
export const RandomizeBar = ({ onRoll }: RandomizeBarProps) => {
  const [seed, setSeed] = useState(newSeed)
  const [last, setLast] = useState<number | null>(null)
  const [amount, setAmount] = useState<number>(MUTATE_AMOUNTS[1].value)

  const roll = (by: number) => {
    onRoll(seed, by)
    setLast(seed)
    setSeed(newSeed())
  }

  return (
    <div className={styles.randomize} role="group" aria-label="Randomize">
      <button onClick={() => roll(1)} data-tooltip="Pick every setting anywhere in its range, from the seed. Locked nodes, wired settings and controls' ranges are left alone.">
        Randomize
      </button>
      <button onClick={() => roll(amount)} data-tooltip="Nudge every setting a little, from the seed: the same sound, a bit different.">
        Mutate
      </button>
      <select aria-label="Mutate by" value={amount} onChange={(event) => setAmount(Number(event.target.value))}>
        {MUTATE_AMOUNTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label>
        Seed
        <input
          aria-label="Seed"
          type="number"
          min={0}
          max={9999}
          step={1}
          value={seed}
          onChange={(event) => {
            const next = Math.floor(Number(event.target.value))
            if (Number.isFinite(next)) setSeed(Math.min(9999, Math.max(0, next)))
          }}
        />
      </label>
      {last !== null && <span className={styles.lastSeed}>last {last}</span>}
    </div>
  )
}
