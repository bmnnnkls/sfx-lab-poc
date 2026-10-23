/** Stable UTF-16 code-unit order for persisted compatibility identities. Never locale collation. */
export const compareCodeUnits = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
