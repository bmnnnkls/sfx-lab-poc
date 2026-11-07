import { createElement } from 'react'
import { ICONS, type IconName } from './icons'
import styles from './Icon.module.css'

export interface IconProps {
  readonly name: IconName
  /** In CSS pixels: 16 in toolbars (the default), 14 in rows. */
  readonly size?: number
  /** Names the icon for assistive technology. Without one it is decoration, and the control it sits in names itself. */
  readonly label?: string
  /** Filled in the text's colour, as the transport's ▶ ■ ● are. */
  readonly filled?: boolean
  readonly className?: string
}

/**
 * One of the app's icons (`ICONS`), drawn in the colour of the text around it, so a control's states colour it too.
 * The stroke is the theme's `--icon-stroke`.
 */
export const Icon = ({ name, size = 16, label, filled = false, className }: IconProps) => (
  <svg
    className={className ? `${styles.icon} ${className}` : styles.icon}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    focusable="false"
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
  >
    {ICONS[name].map(([tag, attributes], index) => createElement(tag, { key: index, ...attributes }))}
  </svg>
)
