import type { Note } from '@core'
import { createClipboard } from '@state'

/** Notes copied in the editor, to paste into any clip in this session. Read with `useClipboard` in components. */
export const noteClipboard = createClipboard<readonly Note[]>([])
