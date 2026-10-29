/**
 * The budgets of in-place sample edits, in one place (round 11 spec, § Built to change): tests import these, not the
 * numbers, so a budget changes here and nowhere else.
 */

const MB = 1024 * 1024

/** Decoded audio of samples recently open in the Wave editor kept on the main thread, so undo and redo don't decode. */
export const WORKING_COPY_CACHE_BYTES = 128 * MB

/** Decoded audio the engine keeps for samples only the undo history names, so undo plays them at once. */
export const ENGINE_KEEP_ALIVE_BYTES = 128 * MB

/** A file an edit wrote is deleted once nothing has named it for this long: a second tab's undo keeps working. */
export const EDIT_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000

/** Switches the cleanup of edit-made files off. */
export const EDIT_CLEANUP_ENABLED = true

/** The cleanup waits this long after startup, then for the browser to be idle. */
export const EDIT_CLEANUP_DELAY_MS = 10_000

/** An edit is refused when the site's free storage is under this many times the file it would write. */
export const ROOM_FACTOR = 2
