/** WCAG 2's relative luminance of a `#rrggbb` colour. */
const luminance = (hex: string): number => {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

/** WCAG 2's contrast ratio of two `#rrggbb` colours, 1 to 21. */
export const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export const isHexColour = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value)
