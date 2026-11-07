---
status: signed off
date: 2026-11-07
note: "Round 13a: the UI foundations that the engine PI's new UI is built on (tokens, no hard-coded colours, themes, one icon set, shared control states). Dark looks as it does today. No engine or format change."
---
# Round 13a: UI foundations

Status: **signed off** 2026-11-07, every decision as proposed. Written 2026-11-07. Part of the
[UI redesign](ui-redesign-roadmap.md#round-13a-ui-foundations-before-the-engine-pi). The inventory was taken on
`feat/ui-themes-1`, branched from `feat/round-12d-touch-arrangement` at `9b93d1b` (format v15).

It comes before the [engine-improvements PI](REPORT-engine-gaps.md#order-with-the-redesign) and round 13b. The PI adds
UI: power and bypass controls on nodes, dormant and sleeping states, routing nodes, modulation routes. That UI should be
built on tokens, icons and shared states from the start, not migrated afterwards. 13b tunes the look once that UI
exists.

## Goal

After this round:

* **Every colour comes from a token.** CSS, inline styles and canvas drawing all read named tokens; a test refuses
  colour literals outside the theme files.
* **Three themes:** *Dark* (the default, unchanged), *Light* and *High contrast*.
  * They are chosen from *View ▸ Theme*, from the command palette, or with a key, and saved per browser.
  * Light and High contrast are complete and contrast-checked, but not polished (13b polishes them).
* **Tokens exist for the PI:** signal kinds (ADR-0003) and the switching states (ADR-0008), even though nothing uses
  them yet.
* **Scales** for spacing, type size, radii, elevation and motion are defined. New code uses them; old code moves to them
  in 13b.
* **One icon set.** An `Icon` component draws every icon-like glyph in the chrome, the library tree, the session's
  slots and the menus. It includes the icons the PI needs.
* **Shared control states.** Hover, pressed, on, disabled and focus-visible each have one style, plus the PI's off,
  bypassed, dormant and sleeping states. Every new control uses them.
* **A dev-only gallery** shows the tokens, the icons and the states in each theme, for the PI and 13b to check
  against.

**Out of scope (13b or later):**
* new colours for Dark, density, a user accent colour;
* following the system's light/dark preference;
* moving spacing and type sizes onto the scales view by view;
* the patcher's wires coloured by signal kind;
* category icons on node headers (the PI redesigns the node header with its power control);
* motion.

## Inventory

### Tokens today (`src/ui/theme.css`, 66 lines)

* **14 colour variables on `:root`:**
  * surfaces: `--bg`, `--panel`, `--panel-raised`;
  * `--border`;
  * text: `--text`, `--text-dim`;
  * accent: `--accent`, `--accent-soft`;
  * states: `--play`, `--queued`, `--record`;
  * `--wire`;
  * the 8 group colours `--group-*`.
* **One size token:** `--radius`.
* **Base styles** for `button`, `input` and `select`, and `color-scheme: dark`.
* **Usage:** `--accent` 147 uses, `--text-dim` 141, `--border` 121, `--radius` 61, `--panel` 40, `--bg` 35, and the rest
  fewer.
* **`flex-theme.css`** maps flexlayout's variables to ours, so it themes for free.
* **Used but defined nowhere:**
  * `--warning` (arrangement, which falls back to `#d88`);
  * `--wave-selection` (the wave editor's canvas, which falls back to an rgba literal).

### Colour literals

There are **82 literals in 30 files** under `src/ui` (hex, `rgb()`, `rgba()`), and none in `src/app`:

* **Fallbacks inside `var()`:** `var(--play, #4caf50)`, 10 in `arrangement.module.css`. The fallbacks don't even match
  the token (`#4caf50` against `#3ddc84`).
* **Shadows and scrims:** `rgba(0, 0, 0, .4–.55)`, in 11 places. Dialogs, menus, the tooltip, the palette and toasts
  each have their own.
* **A red with no token:**
  * `#ff6b6b` in 4 places (status bar, toasts, file menu, transport meter);
  * `#e5484d` (mixer meter);
  * `#ff5d5d` (the red LED);
  * `#ff8a8a` (a menu's danger item).
* **Other one-offs:**
  * the piano roll's grid lines (white at 4–35 %) and selected notes (`#ffd27a`);
  * the audio clip editor's grid;
  * `MidiSettings.module.css`, with its own blue-greys (`#596173`, `#28394b`, `#9aa3b5`);
  * the waveform thumbnail's error colour (`#ff9a6b`);
  * `color: #1b1c1f` as text on the accent;
  * session cells tinted with the play and queued colours as rgba.
* **Canvas fallbacks:** `'#888'`, `'#fff'`, `'#f5a524'`, `'#e8a33d'`, in 8 renderers.

### Canvas

**Eight renderers** read tokens with `getComputedStyle(element).getPropertyValue('--x')`:
* `TimelineLanes`, `ArrangementRuler`;
* the wave editor's `Ruler`, `MarkLane`, `Overview`, `WaveLane` (through `lane-renderers.ts`), and the spectrogram;
* `WaveformThumb`.

They read the tokens when they draw, so a theme change shows only on their next redraw. Two files define the same
`color()` helper.

**The spectrogram's palette** is `SPECTRUM_COLORS` in `wave-editor/spectrogram.ts`: five RGB stops, with a comment
that says a theme should be able to swap it.

### Glyphs as icons

About **80 glyph sites in 40 files**:
* **Activity bar:** ▦ ▤ ∿ ▥ ☰.
* **Region toggles:** ◧ ⬓ ◨.
* **Transport:** ▶ ■ ● ♩ ▾.
* **History:** ↶ ↷.
* **Arrangement toolbar:** ▶ ■ ⟳.
* **Library tree:**
  * kinds: ♪ ◈ ♮ ▦ ▤ ∿ ◇;
  * roots: ◆, and 🔒 (emoji);
  * twisties ▾ ▸, preview ▶ ■, ⚠.
* **Session slots:** ▶ ■ ● ✎.
* **Sample rows:** ▶ ✎.
* **Panel cells:** ⠿ ◀ ▶ ↕ ↔ ◌.
* **Elsewhere:**
  * the node header's ⊶;
  * menus' ▸ and ✓;
  * the twisties in the arrangement;
  * ⚙ and ⋯ buttons.

**Text, not icons, and they stay:** key symbols (⌘ ⇧ ⌥ ⌃ ⌫ in `keys.ts` and shortcut labels), arrows in prose, and
musical symbols in labels.

**Tests that select by glyph:**
* `'▶ Root'`, `'▶ Walk'` and other slot names, about 50 references;
* `'✎'`, 12 references;
* `/■ Loop/`.

Most chrome buttons already have an `aria-label`, so their tests use words.

### Control states

* **No shared style:**
  * `:focus-visible` is styled in 24 rules across 13 files, with outlines, box-shadows or border colours, each its own;
  * many buttons have no focus style but the browser's.
  * `:disabled` is styled in 3 places.
* **"On" is shown in two ways:**
  * a `.active` class (7 files: play's green, the activity bar);
  * `[aria-pressed='true']` (flexlayout's maximize, the region toggles).
* **Missing entirely:** off, bypass, dormant and sleeping.

### Contrast of Dark today (WCAG)

* `--text` is 9.6–12.2 against every surface.
* `--accent` 6.6–8.4, `--play` 7.5–9.6.
* **`--text-dim` is 4.19 on `--panel-raised`** (4.79 on `--panel`), below 4.5.
* **`--record` is 3.85 on `--panel-raised`.**
* **`--border` is 1.2–1.5**, fine for dividers but too faint as a control's only boundary.

### Fixed points

* **`EXTERNAL_ALLOWED`** in `tests/architecture.test.ts` lists `ui`'s dependencies, and `zustand` isn't one of them. A
  theme preference in `ui` therefore uses a small external store with `useSyncExternalStore`, as other per-browser UI
  settings do.
* **Per-browser keys** are `sfxlab:*` (`sfxlab:layout`, `sfxlab:keybindings`, the wave editor's settings).
* **Menus already render checked items** (`MenuEntries`), so *View ▸ Theme* can be three checked commands.
* **`index.html` has no script before the app.** A saved Light theme would flash dark until React mounts, unless the
  attribute is set earlier.

## Design

### Token files

The tokens move into a folder, `src/ui/theme/`:

| File | What |
|---|---|
| `scales.css` | Tokens that don't change per theme: `--space-1…6` (2 4 6 8 12 16 px), `--font-xs/sm/md/lg` (11 12 13 15 px), `--radius-sm` 2, `--radius` 4, `--radius-lg` 8, `--duration-fast` 100 ms, `--duration` 180 ms, `--ease`, `--icon-stroke` 2, `--focus-width` 2px |
| `dark.css` | `:root, [data-theme='dark']`: every colour token, Dark's values, `color-scheme: dark` |
| `light.css` | `[data-theme='light']`: the same tokens, `color-scheme: light` |
| `contrast.css` | `[data-theme='contrast']`: the same tokens, `color-scheme: dark`, `--focus-width: 3px` |
| `base.css` | Today's base element styles, the font, and the shared control states (below) |

`theme.css` stays as the one import and pulls the folder in, so `main.tsx` doesn't change. `flex-theme.css` stays as
it is.

**Names.** The existing names stay as they are. They are already roles (`--panel`, not `--grey-2`), and renaming 600
uses would be churn without a gain. New tokens follow the same style.

| Role | Tokens (new ones in bold) |
|---|---|
| Surfaces | `--bg`, `--panel`, `--panel-raised`, **`--sunken`** (inputs, lanes; today `--bg`), **`--overlay`** (menus, dialogs, tooltip), **`--scrim`** (behind a modal) |
| Elevation | **`--shadow-1`** (tooltip, menu), **`--shadow-2`** (popover, palette), **`--shadow-3`** (dialog) |
| Text | `--text`, `--text-dim`, **`--text-disabled`**, **`--text-on-accent`** |
| Lines | `--border`, **`--border-strong`** (a control's boundary, at least 3:1), **`--focus-ring`** |
| Accent | `--accent`, `--accent-soft`, **`--selection`** (a selected range: wave, piano roll) |
| States | `--play`, `--queued`, `--record`, **`--danger`**, **`--danger-soft`**, **`--warning`** |
| Editors | **`--grid-bar`**, **`--grid-beat`**, **`--grid-step`**, **`--note`**, **`--note-selected`**, **`--note-text`**, `--wire`, **`--spectrum-0…4`** |
| Meters | **`--meter-low`**, **`--meter-mid`**, **`--meter-high`** (in Dark: the play, queued and danger colours) |
| Signal kinds (ADR-0003) | **`--signal-audio`**, **`--signal-pitch`**, **`--signal-mod`**, **`--signal-gate`** (gates and triggers), **`--signal-notes`**, **`--signal-control`** |
| Switching (ADR-0008) | **`--state-off`**, **`--state-bypass`**, **`--state-dormant`**, **`--state-sleeping`**, **`--inactive-opacity`** |
| Groups | `--group-red` … `--group-pink`, as they are in every theme |

* **Dark's new tokens take today's literal values,** so nothing changes on screen. For example:
  * `--danger` is `#ff6b6b`;
  * the meter's top red joins it;
  * `--grid-bar` is today's white at 28 %;
  * the shadows are today's, merged to three steps (within 5 % alpha of each one they replace).
* **`MidiSettings`' blue-greys** become `--border-strong`, `--overlay` and `--text-dim`. They are the one place Dark
  changes visibly, and they join the rest of the app.

### No colour literals, enforced

**A check in `tests/architecture.test.ts`** goes through every `.css`, `.ts` and `.tsx` file under `src/ui` and `src/app`,
outside `src/ui/theme/` and the tests, and refuses:
* in CSS declarations: hex colours, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and named colours other than `transparent`,
  `currentColor` and `inherit`;
* in TS string literals: the same patterns.

**`var()` fallbacks** are refused too (`var(--x, …)`), so a missing token can't hide behind one.

**A second check** reads the three theme files:
* each defines the same set of colour tokens;
* every `var(--…)` the app uses for a colour is defined, or is a local custom property set in the same file (`--led`,
  `--level`, `--glow`). That catches `--warning` and `--wave-selection` today.

**`color-mix()` over tokens stays allowed.** It is how tints are made (`color-mix(in srgb, var(--play) 35%,
transparent)`), and it follows the theme.

### Canvas reads tokens through one helper

`src/ui/theme/theme-colors.ts`:

* **`useThemeColors(names)`** returns `{ [name]: string }`, read once from `document.documentElement`. It is cached per
  theme and recomputed when the theme changes. A canvas puts the result in its effect's dependencies, so it redraws on a
  theme change.
* **`themeColors(names)`** is the same read, for code outside React.
* **The renderers lose their fallbacks** and the two local `color()` helpers. `lane-renderers.ts` already takes its colours
  as an argument.
* **The spectrogram's stops** become `--spectrum-0…4`. `colorLookup(floorDb, stops)` takes them, and the cached lookup
  is keyed by theme. Dark's stops are today's values.

### Choosing a theme

* **`src/ui/theme/theme.ts`** holds the preference: `'dark' | 'light' | 'contrast'`.
  * It is stored per browser under `sfxlab:theme`, and an invalid value reads as Dark.
  * It is a small external store (`subscribe`, `get`, `set`), used through `useTheme()` with
    `useSyncExternalStore`.
  * Setting it writes `data-theme` on `<html>`.
* **No flash on load.** `index.html` gets a few lines of inline script before the app. They copy the stored value to
  `data-theme`, in a `try`, so blocked storage gives Dark.
* **Commands:** `view.theme.dark`, `view.theme.light` and `view.theme.contrast`.
  * They are checked items in *View ▸ Theme* and appear in the palette.
  * `view.theme.next` cycles through the three, with no key by default; users can bind one (round 10).

### Icons

* **Source: [Lucide](https://lucide.dev) 1.70, vendored.**
  * Lucide is ISC-licensed, has about 1,500 icons on a 24-pixel grid with a 2-pixel stroke, and includes every icon on
    our list except a metronome.
  * The icons we use are copied as path data into `src/ui/shared/icon/icons.ts`, with Lucide's licence beside them and
    the version in a comment.
  * There is no runtime dependency, so `EXTERNAL_ALLOWED` doesn't change, and the bundle carries only what is used.
  * Our own icons are drawn on the same grid with the same stroke, and marked as ours: metronome, low-pass curve,
    bypass, dormant.
* **`<Icon name size? label? />`** renders an inline SVG with `stroke="currentColor"` and `stroke-width:
  var(--icon-stroke)`.
  * It is `aria-hidden` unless it has a `label`, in which case it is `role="img"` with that name.
  * `name` is typed from the set, so a missing icon fails the typecheck.
* **The set** (about 45 icons; names checked against 1.70 when vendoring):

| Use | Icons |
|---|---|
| Views | session `layout-grid`, arrangement `rows-3`, wave `audio-waveform`, library `library`, tracks `list` |
| Regions | `panel-left`, `panel-bottom`, `panel-right`, `maximize-2`, `minimize-2` |
| Transport | `play`, `square` (stop), `circle` (record, filled), `repeat` (loop), metronome (ours), `chevron-down` |
| Edit | `undo-2`, `redo-2`, `pencil`, `settings`, `ellipsis`, `x`, `check`, `plus`, `grip-vertical`, `move-horizontal`, `move-vertical`, `chevron-left`, `chevron-right` |
| Library | instrument `piano`, audio effect `audio-lines`, note effect `music`, MIDI clip `file-music`, audio clip `file-audio`, sample `audio-waveform`, module `box`, project `folder`, factory `lock`, warning `triangle-alert` |
| Node categories | Sources `audio-waveform`, Controls `sliders-horizontal`, Indicators `gauge`, Modulation `activity`, Math `sigma`, Logic `binary`, Analysis `chart-spline`, Filters low-pass (ours), Effects `sparkles`, Routing `route`, Modules `boxes` |
| The PI | power `power`, bypass (ours), sleep `moon`, dormant (ours, a dashed circle), routing `split` and `merge`, modulation `spline`, `link` and `unlink` |

* **Where icons replace glyphs in 13a:**
  * activity bar, region toggles, transport bar, history buttons, the arrangement's toolbar;
  * the library tree's kinds, roots, twisties and preview button;
  * the session's slot buttons and ✎;
  * sample rows, panel cells, the node header's ⊶, the menus' ▸ and ✓, the arrangement's twisties, ⚙ and ⋯;
  * the node picker's category list, which gets the category icons.

  Buttons whose label is a word keep the word next to the icon: ● *Touch* and ● *Rec* become an icon plus *Touch* or
  *Rec*.
* **Accessible names** must not depend on a glyph any more:
  * A slot button is named **"Play Root"** or **"Stop Root"** (today "▶ Root", "■ Root"). The arrangement's loop is
    **"Loop"**, and ✎ is **"Edit Demo Kick"** (the item's name).
  * Buttons that are already labelled keep their names.
  * The tests that select by glyph change with them (about 65 references, mechanical).
* **Size:** 16 px in toolbars and 14 px in rows. Icons inherit `color`, so states colour them.

### Shared control states (`base.css`)

**For every button-like control** (`button`, `[role='button']`, `[role='tab']`, `[role='menuitem']`, and controls that
opt in with `.control`):

| State | Selector | Look in Dark (today's look made the rule) |
|---|---|---|
| Hover | `:hover:not(:disabled)` | border `--text-dim` (as `button:hover` today) |
| Pressed | `:active:not(:disabled)` | background `--panel` |
| On | `[aria-pressed='true']`, `[aria-checked='true']`, `[data-on]` | colour and border `--accent` |
| Selected | `[aria-selected='true']`, `[data-selected]` | background `--accent-soft` |
| Disabled | `:disabled`, `[aria-disabled='true']` | colour `--text-disabled`, no hover, `cursor: default` |
| Focus | `:focus-visible` | `outline: var(--focus-width) solid var(--focus-ring)`, offset 1px |

* **Components that style these states themselves drop their own rules for them.** That covers the 24 `:focus-visible`
  rules and the 3 `:disabled` ones. Where the look differs on purpose, the rule stays, with a comment saying why: play
  turns green while it plays, and the library's rows use an inset outline.
* **The 7 `.active` classes** become `aria-pressed` where the control is a toggle, and `data-on` otherwise (play while
  playing).

**The PI's states** are an attribute on any element: `data-power="off" | "bypass" | "dormant" | "sleeping"`.

| State | Look | Meaning (ADR-0008) |
|---|---|---|
| `off` | `opacity: var(--inactive-opacity)`, `filter: grayscale(1)`; the power icon in `--state-off` | Switched off by the user or a socket |
| `bypass` | `--inactive-opacity`, a dashed `--state-bypass` outline | Inactive, passing its input through |
| `dormant` | a slight dim (half of `--inactive-opacity`), no grayscale | Off automatically: nothing audible depends on it |
| `sleeping` | the sleep icon badge in `--state-sleeping` | Silent input, its tail has decayed; wakes by itself |

`--inactive-opacity` is 0.45 in Dark and Light, and 0.6 in High contrast (with the dashed outline, so the state isn't
carried by opacity alone).

### Light and High contrast

* **Light:**
  * neutral greys, with `--bg` the lightest and `--panel-raised` a step darker;
  * text near black;
  * the accent darkened to an amber that reaches 3:1 on the surfaces, with `--text-on-accent` white or black, whichever
    passes;
  * play, record and danger darkened the same way;
  * a lighter spectrogram palette, from paper through violet to near black.
* **High contrast:**
  * a black background, white text, and `--text-dim` at least 7:1;
  * a yellow accent and focus ring;
  * every `--border` at least 3:1;
  * `--focus-width` 3px.
* **Group colours and signal kinds:** the same hues in every theme, adjusted only where they fail 3:1 against the
  theme's surfaces.

**The contrast test** (`src/ui/theme/contrast.test.ts`) parses the three files and checks WCAG ratios:

| Pair | Light | High contrast | Dark |
|---|---|---|---|
| `--text` on `--bg`, `--panel`, `--panel-raised`, `--sunken`, `--overlay` | ≥ 4.5 | ≥ 7 | ≥ 4.5 |
| `--text-dim` on the same | ≥ 4.5 | ≥ 7 | ≥ 4.5, except on `--panel-raised` (4.19, recorded for 13b) |
| `--accent`, `--play`, `--record`, `--danger`, `--focus-ring`, `--border-strong`, signal kinds, groups on the surfaces | ≥ 3 | ≥ 4.5 | ≥ 3, except `--record` on `--panel-raised` (3.85 ≥ 3, passes) |
| `--text-on-accent` on `--accent` | ≥ 4.5 | ≥ 7 | ≥ 4.5 |

* **Dark's exceptions are listed in the test** by name and value. 13b removes them, and a new exception fails.
* **Opaque colour tokens are hex** so the test can parse them. Soft tints, shadows and the scrim may be `rgba` or
  `color-mix`, and aren't in any pair.

### The gallery (dev builds only)

* **What:** `?gallery` on a dev build renders a page instead of the workbench, with:
  * every colour token as a swatch with its name and its contrast against the surfaces;
  * the scales;
  * the icon set at both sizes;
  * a button, a toggle, a knob, a fader and a row in every state, including the four `data-power` ones;
  * a theme switch.
* **How it is kept out of production:** it is mounted from `main.tsx` behind `import.meta.env.DEV` and imported
  dynamically, so a production build doesn't contain it.
* **Screenshots:** a smoke spec opens it in each theme and saves a screenshot as a test artifact, without comparing it,
  for review. The spec also checks that every icon renders, and that `data-theme` follows the command.

## Steps

1. **Baseline.** Screenshots of the default layout and of each main view in Dark, taken on the branch point (Session,
   Arrangement, Mixer, the patcher, the panel, the wave editor with the spectrogram, the library, the piano roll). They
   are kept in the scratchpad, not committed, to compare against at step 9.
2. **Token files.** Move the theme into `src/ui/theme/` (`scales.css`, `dark.css`, `base.css`), and add the new tokens
   with Dark's values taken from today's literals. Nothing changes on screen.
3. **Literals to tokens.**
   * Replace the 82 literals and the `var()` fallbacks in CSS. MidiSettings joins the shared tokens.
   * Add the literal check and the token-definition check to `tests/architecture.test.ts`, with the TS part refusing
     nothing yet beyond the CSS.
4. **Canvas.**
   * Add `theme-colors.ts`, and move the 8 renderers and the spectrogram's palette onto it.
   * Turn on the TS side of the literal check.
   * Unit tests:
     * the helper's cache follows the theme;
     * `colorLookup` uses the stops it is given.
5. **The theme mechanism.**
   * `theme.ts`, the inline script in `index.html`, the commands and *View ▸ Theme*.
   * Set `data-theme='dark'` as the default.
   * Unit tests: storage (invalid and blocked storage give Dark), and the commands.
6. **Light and High contrast.**
   * Write `light.css` and `contrast.css`, and the contrast test with Dark's two recorded exceptions.
   * A pass through the views in each theme for anything unreadable: a token used for the wrong role is fixed by using
     the right one, not by a new token per view.
7. **Icons.**
   * Vendor the set and add `Icon`.
   * Replace the glyphs in the areas listed above, with the accessible names, and update the tests that select by
     glyph.
   * Category icons in the node picker.
8. **Shared states.**
   * `base.css`'s state rules and `data-power`.
   * Remove the components' own focus and disabled rules where they match the shared look.
   * `.active` becomes `aria-pressed` or `data-on`.
9. **Gallery and checks.**
   * The gallery and its smoke spec.
   * Compare the screenshots against step 1's baseline. Dark differs only in icons, MidiSettings and focus rings.
10. **Docs.**
    * `architecture/workbench.md` gets a *Themes and tokens* section: the files, the roles, the rules (no literals, the
      shared states, `Icon`), and how canvas reads tokens.
    * Decisions numbered from 180.
    * `guide/tour.md` mentions *View ▸ Theme*.
    * STATUS and BACKLOG U3a are closed, and the roadmap marks 13a done. The plan is archived with its notes.

Each step runs the unit tests and the typecheck. Steps 3, 7 and 8 also run the smoke groups they touch, and step 9
runs all of them.

## Behavior changes

* **Dark:**
  * icons instead of glyphs;
  * MidiSettings in the app's colours;
  * a consistent focus ring on every control (some had only the browser's);
  * disabled buttons dimmed everywhere.

  Everything else is pixel-equal or within the shadow merge.
* **New:** *View ▸ Theme* with Light and High contrast, saved per browser.
* **Accessible names:**
  * slot buttons are "Play X" or "Stop X";
  * the loop button is "Loop";
  * ✎ buttons are "Edit X".
* No change to projects, the format, the engine or the audio.

## Verification

* **Unit:**
  * the literal and token-definition checks;
  * the contrast test;
  * the theme store and commands;
  * the colour helper;
  * `colorLookup`;
  * `Icon` (labelled and hidden).
* **Smoke:**
  * every group, with the glyph-to-name updates;
  * the gallery spec in three themes;
  * one spec that switches theme while the wave editor shows a spectrogram, and checks that the canvas redrew (a pixel
    read differs).
* **Screenshots:** step 1 against step 9 in Dark, reviewed by eye.
* **Hand pass:** each theme across the main views, keyboard focus through the transport and the activity bar, and
  Firefox and Safari for the inline script and `color-scheme`. Recorded in BACKLOG if not done in the round.

## Decisions to sign off

| # | Question | Proposed |
|---|---|---|
| 1 | Rename tokens to a new scheme? | **No.** The existing names are roles already; new tokens follow them |
| 2 | Icon source | **Lucide 1.70, vendored as path data** (ISC), plus our own on the same grid; no runtime dependency |
| 3 | Themes in 13a | **Dark (default), Light, High contrast.** No *Match system* until Light is polished (13b) |
| 4 | Where the preference lives | **Per browser** (`sfxlab:theme`), like layouts and keys, set before first paint |
| 5 | Dark's contrast shortfalls (dim text on raised 4.19) | **Recorded as exceptions** and fixed in 13b with Dark's other tuning, so 13a doesn't change Dark's look |
| 6 | How far icons go in 13a | **Every icon-like glyph** (chrome, library, slots, menus, panel cells). Key symbols and prose stay text |
| 7 | Accessible names that carried a glyph | **Words:** "Play Root", "Loop", "Edit Demo Kick"; tests updated |
| 8 | Scales | **Defined now, adopted by new code;** existing spacing and type move in 13b |
| 9 | PI states | **`data-power` attribute** with four values, styled once in `base.css`; tokens per state |
| 10 | Signal-kind colours | **Tokens only;** wires stay one colour until the PI gives ports kinds |
| 11 | Gallery | **Dev builds only,** behind `?gallery`, with an unchecked screenshot per theme |
| 12 | `var()` fallbacks | **Refused** by the literal check |
