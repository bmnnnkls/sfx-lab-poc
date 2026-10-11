const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** `shortcut('C')` -> "⌘C" on Apple devices, "Ctrl+C" elsewhere. For display in menus and tooltips. */
export const shortcut = (key: string): string => (isApple ? `⌘${key}` : `Ctrl+${key}`)
