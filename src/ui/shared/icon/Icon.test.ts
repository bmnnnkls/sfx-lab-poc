import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ICONS, type IconName } from './icons'

const render = (props: Parameters<typeof Icon>[0]) => renderToStaticMarkup(createElement(Icon, props))

describe('Icon', () => {
  it('is hidden from assistive technology unless it is labelled', () => {
    expect(render({ name: 'play' })).toContain('aria-hidden="true"')
    expect(render({ name: 'play' })).not.toContain('role=')
    const labelled = render({ name: 'warning', label: 'Missing sample' })
    expect(labelled).toContain('role="img"')
    expect(labelled).toContain('aria-label="Missing sample"')
    expect(labelled).not.toContain('aria-hidden')
  })

  it('draws in the text colour, outlined or filled, at the size asked for', () => {
    expect(render({ name: 'stop' })).toMatch(/fill="none" stroke="currentColor"/)
    expect(render({ name: 'stop', filled: true, size: 14 })).toMatch(/width="14" height="14" viewBox="0 0 24 24" fill="currentColor"/)
  })

  it('has a shape for every name, on the 24-pixel grid', () => {
    for (const name of Object.keys(ICONS) as IconName[]) {
      expect(ICONS[name].length, name).toBeGreaterThan(0)
      const numbers = ICONS[name].flatMap(([, attributes]) => Object.entries(attributes).filter(([key]) => key !== 'd').map(([, value]) => Number(value)))
      expect(numbers.every((value) => value >= 0 && value <= 24), name).toBe(true)
    }
  })
})
