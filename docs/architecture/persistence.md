# Undo, saving and file formats

History, autosave, import and export, and the signature canonicalization behind project v9 and later. Version numbers are listed in [formats and versions](../reference/formats-and-versions.md).

## Undo / redo

* `core/history` is a generic, pure `History<T>` (`past` / `present` / `future`). The project store holds a
  `History<Project>`; `project` is always `history.present`. Snapshots are immutable, so unchanged tracks, clips
  and patches are shared between entries and keeping 200 steps is cheap.
* **Every document edit is undoable**, including replacing the whole project (import / new / demo / restore).
  The startup load is not (`resetProject`), so a fresh session starts with an empty history. Selection, transport
  and the playhead are not part of history. **View fields** are saved but not undone: a group's `collapsed`, a track's
  `hidden`, the pins and the arrangement loop's `enabled`. The store writes them with `editView`, and `withViewOf` gives
  a project that undo or redo brings back what shows now.
* **Drags are one step.** Continuous edits pass a merge key (`param:<track>:<node>:<param>`, `move:<track>:<node>`,
  `volume:<track>`, `tempo`, `name`); consecutive edits with the same key within 800 ms collapse into a single
  entry. Discrete actions (add node, connect, toggle note, add track…) pass no key, so each is its own step.
  An undo or redo always ends the merge, so the next edit starts a new step.
* **Nothing else needs to know.** Undo/redo just changes `project`, so `diffProject` updates the engine (param
  changes become `setParam`, structural ones rebuild the voice) and autosave stores the undone state. History
  itself is not saved: it is empty after a reload.
* UI: ↶ ↷ buttons in the transport bar and `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y` (ignored inside text fields,
  which keep the browser's own undo).
* **To make a new continuous control undoable as one step**, pass a stable merge key to its store action.
* **Sample bytes are not in history** (round 11b). An edit in place stores a new file before the project names it, and
  files are only added, never changed, so undo needs nothing but the old `SampleInfo`: its bytes are still stored. Two
  caches make undo and redo of an edit (or of *Remove*) instant, each within a budget in `app/sample-budgets.ts`:
  * **the working copies** (`app/working-copies.ts`): recent decoded working copies the Wave editor let go of, least
    recently used out first past `WORKING_COPY_CACHE_BYTES` (128 MB). Opening a sample and an edit's read look there
    before decoding;
  * **engine keep-alive** (`keepAlive` in `app/sample-library.ts`): a sample the present project doesn't use stays in the
    engine while any history entry (`past`, `present`, `future`) names it, so undo plays it at once; the first to leave
    goes first once such audio passes `ENGINE_KEEP_ALIVE_BYTES` (128 MB); one no entry names gets `sample/remove` at
    once. It runs on every history change (a commit can drop the redo future without touching the present's samples)
    and reads only the `samples` arrays, each once, since entries share them. Past the budget, undo reloads the sample
    from storage and its uses are silent for that moment.

## Saving, loading, import/export

* **One format, one gate.** Autosave, export and import all use `core/persistence`. Files are
  `{ "format": "sfx-lab-project", "version": N, "project": … }`. `parseProject(text)` is the *only* way
  untrusted text becomes a `Project`: it checks the envelope, refuses newer versions with a clear message,
  runs `migrations.ts` (`MIGRATIONS[n]` upgrades v*n* → v*n+1*), then **sanitizes** by rebuilding patches through
  the normal edit functions (`addNode`/`connect`). So unknown nodes, bad ports, cycles, out-of-range params and
  oversize inputs are dropped or clamped and reported as warnings, instead of crashing the audio worklet.
  It never throws.
* **To change the saved shape:** bump `CURRENT_VERSION`, add a migration, and commit a new fixture beside
  `persistence/fixtures/v1-minimal.sfxlab.json` — the old fixture must keep loading.
* **The arrangement's fields**, all optional: `arrangement` (regions, `sanitizeArrangement`), `arrangementMarkers` and
  `arrangementLoop` (v13, `sanitizeArrangementMarks`); see [the arrangement](clips-and-arrangement.md#the-arrangement-clips-on-a-timeline).
* **Autosave:** `app/autosave.ts` subscribes to the project store; `storage/autosaver.ts` debounces (500 ms)
  and flushes on tab hide / `pagehide`. The header shows Saved / Saving… / Not saved.
* **Startup:** `app/services.ts` loads the saved project *before* the first render. With nothing saved, a first visit opens on
  the flagship example (`FLAGSHIP_EXAMPLE`) and a welcome toast says how to start; `?starter` in the address keeps the plain
  three-track starter instead (the browser checks in `docs/browser-checks` use it, since they were written against it). Unreadable data is
  copied to `sfxlab:corrupt` (never silently overwritten) and the starter is used, with a toast explaining why.
* **Replacing the project** (import / new / starter / example / restore) goes through one function in `app/project-files.ts`:
  it saves the outgoing project to a **one-slot backup**, stops the transport, resets selection, then swaps.
  *File → Restore previous* swaps back (and the slot then holds what you just left).
* If browser storage is unavailable (private mode), the app keeps working in memory and says so.
* **Files edits wrote are cleaned up** (round 11b, `app/sample-cleanup.ts`). The `sample-edits` store (`sfxlab` database
  version 3, `storage/sample-edit-log.ts`) notes the id and time of each file an in-place edit or a copy wrote. Once per
  start, `EDIT_CLEANUP_DELAY_MS` after it and when the browser is idle, and only with persistent storage and
  `EDIT_CLEANUP_ENABLED`, each noted file older than `EDIT_CLEANUP_AGE_MS` (a day) loses its bytes and its note unless
  something names it: the raw text of any project slot (`ProjectStorage.slotTexts`: current, backup, corrupt,
  pre-signature; a text search for the id, so an unreadable slot still protects its samples), the library catalog, or
  this tab's history. Imported files are never noted (importing bytes an edit wrote forgets the note), and bytes from
  a project package or a library bundle aren't noted, so neither is ever deleted. A second tab's undo of an edit older
  than a day can find its file gone; the sample then shows *audio missing*.
* Ids are random (`createId`), so ids from saved projects never collide with new ones.

## Signature canonicalization and the v9 transition

Automation planning snapshots entry overrides into reused storage before ticking a horizon. When a target first
acquires a curve later in that horizon, its prefix uses the value effective at entry. A queued launch can therefore
clear an override at its actual boundary without changing earlier samples. Curves remain alive across all audio
subruns. Regression tests cover mixer, graph, send, return/master and partitioned rendering.

AudioHost treats startup/preparation/resume or processor failure as terminal for that page. `start()` settles without
an unhandled rejection and `onFailure` publishes the error. Failed hosts stop queuing commands and close their context.
A persistent workspace alert instructs the user to save/export and reload; editing and persistence remain available.
There is no automatic reload or partial engine reconstruction after transferred sample buffers may have detached.

Structural signatures use explicit UTF-16 code-unit comparison rather than locale collation. Sample choices remain
outside structural identity. The enclosing versions identify this canonicalization: project envelope **v9**, local
library catalog **v2**, and `.sfxlib` manifest **v2**. `.sfxlab` packages contain the same v9 project envelope; IndexedDB
schema stays v2. Previous application readers reject these newer enclosing versions.

Project v8→v9 retains the existing repair/sanitize contract and recomputes revision signatures from validated payloads.
The first overwrite of an older browser project stores its original serialized envelope at localStorage key
`sfxlab:pre-signature-v9`; if that write fails, current data is not overwritten. This backup is independent of the
ordinary import/new-project backup and is not replaced by subsequent saves.

Local library v1→v2 conversion preserves opaque IDs, payloads, preset state, samples, unreferenced records and trash.
Only understood ordering differences in parsed legacy signatures are accepted; signatures must still match the
reconstructed payload. Portable clip guards have no source graph, so their bounded tuple structure and lane indexes
are validated while retaining node order. Unknown or ambiguous legacy forms fail with recovery/re-export guidance.
The original catalog is stored under `catalog/pre-signature-v2` and `catalog/current` replaced in the same readwrite
transaction. Failure aborts both writes; sample bytes are untouched. The strict bundle validator is deliberately not
applied to local catalogs, because local trash and retained dependencies are legal.

Bundle v1/catalog v1 imports convert in staging and then pass strict current validation and sample hash checks.
Bundle v2 requires catalog v2; mixed or future versions reject. Current portable guards must already be canonical
and match the lane's indexed node type. Import never modifies the source file. Revision IDs are not deduplicated
merely because canonical signatures converge. Existing project/package, nested preset recall, library insertion,
legacy/strict bundle and transaction rollback checks cover the transition.

Recovery requires an original compatible project/catalog, not just reverting the application. Before intentionally
rolling back, export current work, close other app tabs, preserve the raw backup keys and sample store, and use the
previous app with the old project export or restored catalog backup. Do not clear site storage: that deletes sample
bytes as well. Neither backup is a substitute for an external export, and browser eviction can remove both.

The demo accepts the historical first-callback and no-lane overhead limitations recorded in
`docs/measurements/f1-fix`. No new capacity claim or C6 experiment is included in this stabilization.
