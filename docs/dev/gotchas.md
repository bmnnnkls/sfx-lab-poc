# Gotchas

Traps that have cost time before, collected from the plans' "Changes made while implementing" notes. Each entry gives
the rule and where it came from. Add to it when a plan's notes record a surprise that the next person would hit too.

## Environment

* **A native CSS binary fails to load** (Lightning CSS on macOS, 2026-10-17): the installed binary was truncated. Run
  `npm ci`. Don't copy `node_modules` between operating systems; the lockfile already has every platform's records.
* **Only Chromium is installed for Playwright** on the main development machine. The Firefox and WebKit builds
  matching the installed Playwright version are not downloaded, and Firefox isn't installed. So "checked in Firefox
  and Safari" has not happened for any redesign round ([BACKLOG](../BACKLOG.md#verification-debt) V3).
* **Automated key presses prove nothing about browser shortcuts.** Playwright and DevTools-driven browsers deliver
  every key to the page, even ones the real browser would keep (⌘T, ⇧⌘P in Firefox). Browser-reserved keys must be
  checked by hand. *(round 10)*

## Browser tests

* **Hidden views stay in the DOM.** The workbench keeps views mounted in `<Activity>`, and flexlayout renders border
  panels before the editor's. A page-wide `getByText(...).first()` can find the hidden copy. Scope locators to a view
  (`viewRoot(page, 'Session')`). *(round 2)*
* **Hidden views don't re-render.** A view kept in `<Activity>` doesn't update until it is shown again, so show it
  before reading what it draws. *(round 7)*
* **`getByLabel` matches part of a label.** The arrangement's ruler, labelled "Bars and beats", made the export dialog's
  `getByLabel('Bars')` find two elements. Pass `exact: true`, or name things so they don't contain another's label.
  *(round 12a)*
* **Playwright's `fill` refuses a range input's value off its step** ("Malformed value") when `min` isn't a whole
  number of steps from it. Move the slider with its keys (Home, End, arrows) instead. *(round 12a)*
* **Reading the saved project right after loading** can race the autosave and read `null`. This is the known flake in
  `library.smoke.spec.ts` (V6). Wait for the save. *(round 8)*
* **Audio specs that time edits from the page are load-sensitive.** `tempo.audio.spec.ts`'s ping-pong tail check
  failed while other work was running, and passed alone. Re-run on a quiet machine before suspecting the engine.
  *(round 8)*
* **IndexedDB version races.** Code that opens the library database early (at startup) can upgrade it before a test's
  "older tab" stand-in opens the old version. Background work that touches storage waits (`EDIT_CLEANUP_DELAY_MS`,
  then idle). *(round 11b)*
* **Playwright's single-step mouse moves close Radix submenus.** Pick from submenus with the keyboard in specs.
  *(round 3)*
* **Fixtures for new format versions**: write them with a throwaway test from a project built in code, then commit the
  JSON and delete the test. *(rounds 8, 9)*
* **`npx playwright test` serves whatever `dist/` holds.** Its web server is `vite preview`, so a spec run that way
  tests the last build: run `vite build` first (`npm run test:smoke` does). *(round 11c-2)*
* **Two browser-test runs at once collide**: they share port 4173 and `test-results/`, so one can't start its server
  or loses its trace files ("ENOENT … .trace"), which reads like a failed test. Run them one after the other.
  *(round 11c-2)*
* **The unit tests beside a smoke run fail its timed specs**: `vitest` starts a worker per file, and specs with bounded
  waits (the library's isolated previews, the spectrogram following an edit) time out. Don't run anything heavy while
  the smoke tests run. *(round 11d-2)*
* **Short samples draw the spectrogram `stretched` or `on-demand`, not `levels`**: 2 s in a 1300 px lane is under the
  hop a pixel. Wait for `data-spectrum` to leave `pending`, and check what the spectrogram shows by its pixels (a tone's
  row brighter than an empty one), not by its kind. *(round 11d-1)*
* **A slice sent to the worker must hold every frame its columns' windows read** (`framesRead`), in whole frames:
  `slice` truncates a fraction, which shifts the columns by a frame against the offset. *(round 11d-1)*
* **A spec that imports from another spec runs that spec's tests too.** Put shared helpers in a plain module
  (`marked-sample.ts`, `preset-project.ts`). *(round 11c-3)*

## Browsers and the DOM

* **Wheel and mouse events report whole pixels** in Chromium (pointer events keep the fraction). A canvas at a
  fractional offset zooms up to 1 px off the cursor. `PatchCanvas` zooms at the last pointer position. *(round 2)*
* **Chromium on macOS fires `contextmenu` for the Menu key, not for Shift+F10.** `ContextMenu` handles Shift+F10
  itself. *(round 5)*
* **Element fullscreen hides Radix menus and tooltips**, which render into `document.body`. That is why maximize means
  "maximize inside the window". *(round 3)*
* **⌥ and AltGr turn letters into symbols** (⌥B is "∫"). Match keys by `event.key` for Latin letters and digits, and
  by `event.code` otherwise. *(round 10)*
* **Shift with a bracket is a brace** on most layouts (`event.key` is `{`), so `keyOf` gives `shift+{`. A table that
  means Shift with `[` takes both. *(round 11c-2)*
* **A Mac has two delete keys** (⌫ `delete`, ⌦ `forwarddelete`), and `meta` is the Windows key elsewhere. *(round 10)*
* **`putImageData` ignores the canvas's transform and clip.** On a lane scaled to the device pixel ratio and clipped to
  a part, it lands at device pixels in the corner. Put the image into a scratch canvas and `drawImage` that, which
  honours both. *(round 11d-1)*
* **Sticky headers hide what `scrollIntoView` aligns.** In a scroller with sticky headers, an element scrolled into
  view lands under them (Playwright scrolls drop targets into view too). Give the scroller a `scroll-padding` the size
  of the sticky parts, as the arrangement does. *(round 12a)*
* **A scroll event comes after the frame that scrolled.** Setting `scrollLeft` by hand and a playhead's next frame
  setting it again can both happen before one `scroll` event, which then sees only the last. To tell a program's scroll
  from the user's, compare `scrollLeft` with where the program left it, before scrolling again. *(round 12a)*
* **The project's types are the window's** (`lib: DOM`), so a worker file has no `DedicatedWorkerGlobalScope`. Type
  the part of `self` it uses, as `audio/spectrum-worker.ts` does. *(round 11d-1)*

## Architecture

* **`ui` can't import zustand.** A narrower subscription is a hook in `state` (`useProjectSelect`). *(round 9)*
* **Never subscribe a component to the whole transport status or the whole project** when it shows only part of
  it. The status store updates about 30 times a second, and `tests/status-subscriptions.test.ts` fails on a `ui`
  component that selects all of it. The project has no such test: with several panels on screen, a knob turn
  re-rendered all of them until `PanelView` selected only its graph. *(rounds 1b, 5, 9)*
* **An action's id starts with its subject's kind, and a list keeps the group order** (open, edit, clipboard, delete,
  process, view). The action tests check every list, so a plan's `wave.cut` became `sample-selection.cut`. *(round
  11c-1)*
* **A closing menu gives the focus back to its trigger,** taking it from a popover or field its entry just opened.
  Mark such an entry `takesFocus`. *(rounds 5, 11c-1)*
* **`ActionMenu` draws no menu without a subject.** A trigger whose subject depends on the pointer (the mark lane)
  always needs one, or a right-click there opens nothing. *(round 11c-2)*
* **Two panes asking for one sample in the same tick decode it twice**, since each pane's `loading` is its own and
  neither holds a copy yet. `openAudio` waits on one decode per sample (`decodeWorking`). *(round 11c-3)*
* **A second pane without a sample of its own follows the first,** so whatever moves the first moves it too. Code
  that must move only the first (an edit with *Edits make copies* from it) sets the second's `sampleId` first.
  *(round 11c-3)*
* **A drag snaps to what it moves.** Snap targets include the dragged mark's own position, a frame behind the pointer,
  so it sticks there. Targets are named and a drag leaves out its own (`snapFrame`'s `ignore`). *(round 11c-2)*
* **flexlayout 0.x minor versions break.** It is pinned and imported only from `ui/layout/`, and the architecture test
  enforces both. Upgrade on purpose. *(round 2)*
* **Old projects must stay bit for bit the same.** Engine changes that touch mixing or decoding are checked against
  bounce hashes taken before the change (`core/engine/old-projects.test.ts`). `monoAt` rounds exactly as the old
  `toMono` did, through a `Float32Array`. *(round 11a)*

## Measuring

* **The machine's load moves the numbers.** Profiles have run at load averages of 5 to 9. To compare two builds,
  profile both in the same session, interleaved, rather than comparing with an old record. *(round 11b)*
* **Commit the measuring script with the numbers.** Several rounds recorded timings from scripts that were never
  committed (V8).
