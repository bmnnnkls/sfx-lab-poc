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

## Browsers and the DOM

* **Wheel and mouse events report whole pixels** in Chromium (pointer events keep the fraction). A canvas at a
  fractional offset zooms up to 1 px off the cursor. `PatchCanvas` zooms at the last pointer position. *(round 2)*
* **Chromium on macOS fires `contextmenu` for the Menu key, not for Shift+F10.** `ContextMenu` handles Shift+F10
  itself. *(round 5)*
* **Element fullscreen hides Radix menus and tooltips**, which render into `document.body`. That is why maximize means
  "maximize inside the window". *(round 3)*
* **⌥ and AltGr turn letters into symbols** (⌥B is "∫"). Match keys by `event.key` for Latin letters and digits, and
  by `event.code` otherwise. *(round 10)*
* **A Mac has two delete keys** (⌫ `delete`, ⌦ `forwarddelete`), and `meta` is the Windows key elsewhere. *(round 10)*

## Architecture

* **`ui` can't import zustand.** A narrower subscription is a hook in `state` (`useProjectSelect`). *(round 9)*
* **Never subscribe a component to the whole transport status or the whole project** when it shows only part of
  it. The status store updates about 30 times a second, and `tests/status-subscriptions.test.ts` fails on a `ui`
  component that selects all of it. The project has no such test: with several panels on screen, a knob turn
  re-rendered all of them until `PanelView` selected only its graph. *(rounds 1b, 5, 9)*
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
