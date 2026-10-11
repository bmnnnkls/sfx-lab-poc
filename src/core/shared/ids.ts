let counter = 0

/** Short, human-readable, unique-per-session id such as `node_3`. */
export const createId = (prefix: string): string => `${prefix}_${(counter++).toString(36)}`
