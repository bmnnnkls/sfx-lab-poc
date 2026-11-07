import { useState } from 'react'
import { Fader, Knob, Toggle } from '../../controls'
import { Icon, ICONS, type IconName } from '../../shared/icon'
import darkSource from '../dark.css?raw'
import { contrast, isHexColour } from '../contrast'
import { THEME_NAMES, THEMES, setTheme, useTheme } from '../theme'
import { useThemeColors } from '../theme-colors'
import styles from './Gallery.module.css'

/** Dark's tokens in the file's order, with the comment above each group as its heading. */
const TOKEN_GROUPS: readonly { readonly title: string; readonly names: readonly string[] }[] = (() => {
  const groups: { title: string; names: string[] }[] = []
  for (const line of darkSource.split('\n')) {
    const heading = line.match(/^\s*\/\*\s*(.+?)\s*(\*\/)?$/)
    const token = line.match(/^\s*(--[\w-]+)\s*:/)
    if (heading && !line.includes('Dark, the default')) groups.push({ title: heading[1]!.replace(/[.:].*$/, ''), names: [] })
    else if (token) (groups.at(-1) ?? groups[groups.push({ title: 'Tokens', names: [] }) - 1]!).names.push(token[1]!)
  }
  return groups.filter((group) => group.names.length > 0)
})()
const ALL_TOKENS = TOKEN_GROUPS.flatMap((group) => group.names)

const SPACES = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6']
const FONTS = ['--font-xs', '--font-sm', '--font-md', '--font-lg']
const RADII = ['--radius-sm', '--radius', '--radius-lg']
const SHADOWS = ['--shadow-1', '--shadow-2', '--shadow-3']
const POWER = [
  { state: 'off', icon: 'power', meaning: 'Off: switched off by the user or a socket' },
  { state: 'bypass', icon: 'bypass', meaning: 'Bypass: inactive, passing its input through' },
  { state: 'dormant', icon: 'dormant', meaning: 'Dormant: off by itself, nothing audible needs it' },
  { state: 'sleeping', icon: 'sleep', meaning: 'Sleeping: silent input, wakes by itself' },
] as const satisfies readonly { state: string; icon: IconName; meaning: string }[]

/**
 * The theme gallery (`?gallery`): every token, the scales, the icons and the controls' states, in the theme chosen at
 * the top. Not linked from the app; it is where new UI and the themes are checked against each other.
 */
export const Gallery = () => {
  const theme = useTheme()
  const colours = useThemeColors(ALL_TOKENS)
  const [knob, setKnob] = useState(0.4)
  const [fader, setFader] = useState(0.7)
  const [on, setOn] = useState(true)
  return (
    <main className={styles.gallery}>
      <header className={styles.top}>
        <h1>Theme gallery</h1>
        <div role="group" aria-label="Theme" className={styles.row}>
          {THEMES.map((name) => (
            <button key={name} aria-pressed={theme === name} onClick={() => setTheme(name)}>{THEME_NAMES[name]}</button>
          ))}
        </div>
      </header>

      <section aria-labelledby="colours">
        <h2 id="colours">Colours</h2>
        <p className={styles.note}>Contrast against <code>--panel</code>, for colours written as hex.</p>
        {TOKEN_GROUPS.map((group) => (
          <div key={group.title}>
            <h3>{group.title}</h3>
            <ul className={styles.swatches}>
              {group.names.map((name) => {
                const value = colours[name] ?? ''
                const panel = colours['--panel'] ?? ''
                const ratio = isHexColour(value) && isHexColour(panel) ? contrast(value, panel).toFixed(2) : undefined
                return (
                  <li key={name} className={styles.swatch} data-token={name}>
                    <span className={styles.chip} style={{ background: `var(${name})` }} />
                    <code>{name}</code>
                    <span className={styles.value}>{value}{ratio && ` · ${ratio}:1`}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="scales">
        <h2 id="scales">Scales</h2>
        <div className={styles.scales}>
          {SPACES.map((name) => <div key={name} className={styles.space}><span style={{ width: `var(${name})` }} /> <code>{name}</code></div>)}
          {FONTS.map((name) => <div key={name} style={{ fontSize: `var(${name})` }}>The quick brown fox <code>{name}</code></div>)}
          <div className={styles.row}>
            {RADII.map((name) => <div key={name} className={styles.box} style={{ borderRadius: `var(${name})` }}><code>{name}</code></div>)}
            {SHADOWS.map((name) => <div key={name} className={styles.box} style={{ boxShadow: `var(${name})` }}><code>{name}</code></div>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="icons">
        <h2 id="icons">Icons</h2>
        <ul className={styles.icons}>
          {(Object.keys(ICONS) as IconName[]).map((name) => (
            <li key={name} data-icon={name}>
              <Icon name={name} />
              <Icon name={name} size={14} />
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="states">
        <h2 id="states">Control states</h2>
        <p className={styles.note}>Hover, press and Tab to see the rest.</p>
        <div className={styles.row}>
          <button>Normal</button>
          <button aria-pressed="true">On</button>
          <button data-selected="">Selected</button>
          <button disabled>Disabled</button>
          <button aria-label="Play"><Icon name="play" filled /></button>
          <button className={styles.withIcon}><Icon name="record" filled /> Rec</button>
          <button className={styles.withIcon} aria-pressed="true"><Icon name="loop" /> Loop</button>
        </div>
        <div className={styles.row}>
          <Knob label="Knob" position={knob} valueText={knob.toFixed(2)} defaultPosition={0.5} onChange={setKnob} />
          <Knob label="Disabled" position={0.3} valueText="0.30" defaultPosition={0.5} disabled onChange={() => {}} />
          <Fader label="Fader" position={fader} valueText={fader.toFixed(2)} defaultPosition={0.5} onChange={setFader} />
          <Toggle label="Toggle" on={on} onChange={setOn} />
          <Toggle label="Disabled" on={false} disabled onChange={() => {}} />
        </div>
        <h3>Parts switched off (ADR-0008)</h3>
        <div className={styles.row}>
          <div className={styles.part}><span className={styles.partHeader}><Icon name="power" /> Active</span><span>Filter</span></div>
          {POWER.map(({ state, icon, meaning }) => (
            <div key={state} className={styles.part} data-power={state} title={meaning}>
              <span className={styles.partHeader}><span className={styles.powerIcon}><Icon name={icon} label={state} /></span> {state}</span>
              <span>Filter</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
