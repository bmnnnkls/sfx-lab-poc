# Common changes

Recipes for the changes made most often. Each names every place that must change.

**Add a command** — one that needs only `state` goes in `STATE_COMMANDS` (`state/commands/state-commands.ts`), one
that opens a dialog, moves the DOM focus or reads `ui`'s data in `UI_COMMANDS` (`ui/commands/ui-commands.ts`). Give it
a stable id (keys are saved by it), a category and a title; `label` when a menu should say something else now. It shows
in the palette and the shortcuts dialog at once; add it to a list in `ui/commands/menus.ts` to put it in a menu. An
action on a thing is not a command: add it to its kind's list in `state/actions/`, with a `verb` if an edit key should
run it.

**Add a key** — a row in `DEFAULT_KEYS` (`ui/commands/keybindings.ts`): the command, the key (`mod+alt+x`), the Apple
key if it differs (`ctrl+mod+x`), and a scope if not `outside-text`. Never a key a browser keeps; check the new key by
hand in Chrome, Firefox and Safari, since a test's keys reach the page whatever the browser would do. Tooltips take it
from `useKeyLabel`.

**Add a DSP node** — create `core/dsp/nodes/<name>.node.ts` exporting a `NodeDefinition`, add it to
`core/dsp/registry.ts` (add its words to `node-docs.ts` or the completeness test fails; every numeric parameter then has a socket automatically; `paramSockets: false` opts out, `global: true` lets it run in the global stage; an elementwise math node is a few lines with `mathNode`). Set `shared: true` if it is an effect whose state must outlive individual notes (reverb,
chorus, …). The picker, parameter UI, engine and file loader pick it up automatically.

**Add an engine capability** — add a variant to `EngineCommand`, handle it in `Engine.apply`, and (if it comes
from the document) produce it in `core/sync/diff-project.ts`. If it is a one-off UI action, expose it on
`EngineControls` (`state/engine-controls.tsx`) and implement it in `app/engine-controls.ts`.

**Add another kind of track** — extend the `Track` union, add its runtime implementing `PlayableTrack`, a `track/add`
variant and diff in `core/sync`, a sanitizer in `persistence`, and a slot variant in the session grid; `Engine` and the
launcher queue need no changes (the return track was added this way; TypeScript finds every `switch` on `kind`).

**Add a UI feature** — new folder under `ui/`, read state via `@state` hooks. A new view gets an id in `ViewId`
(`state/layout-store.ts`), a place in a group of `DEFAULT_LAYOUT` there, and an entry in `ui/layout/views.ts` with its
title (and tooltip) in `ui/layout/view-titles.ts`; add the title and id to `tests/browser/fixtures.ts`. Saved layouts
get the new view in its default region on their next load. Code that should show it calls `revealView` or an intent in
`state/navigation.ts`, never a tab setter.

**Add a field to the project** — add it to `project/types.ts`, give it a safe default in
`persistence/sanitize-*.ts`, bump the format version, add an explicit migration and commit a fixture for the new shape.

**Add an example project** — a folder under `core/examples/` with an `index.ts` that builds the project with `patchOf`, `moduleOf`, `drumNotes` /
`lineNotes` and `projectOf` (see "Example projects"), then an entry in `examples/index.ts` (`exampleProjects`; the title, a tagline with the BPM
and a few lines of `howTo`). `examples.test.ts` runs the same checks on every registered example, so a new one is held to them at once; add a
test file for what it claims, and render it (`renderProject`) to hear whether it is balanced before you trust a level.
