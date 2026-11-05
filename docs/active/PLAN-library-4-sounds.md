---
status: done
date: 2026-11-05
shipped_in: architecture/library-and-presets.md
note: "Phase 4 of SPEC-library-ux.md, built on feat/library-improvements: Sounds shows the presets and snapshots of the selection, rows recall on click onto it, morph from rows, saving without a name field. Also shipped in architecture/workbench.md. Stays in active/ until phase 7 archives the round."
---
# Library phase 4: Sounds shows the presets of what is selected

Phase 4 of [SPEC-library-ux.md](SPEC-library-ux.md) (§ 4.1, D9, D10). It doesn't depend on phases 1–3 except for
phase 2's *Save to library* on a preset row, which it keeps. Phase 5 adds the *From the library* section. Inventory
taken at `9b4f2cd`, re-checked at `e598c47`.

## Goal

```
┌ Sounds ───────────────────────────────────────────┐
│ Bass   [Instrument | Effects | Notes | Track]  ⋯  │
│ In this project                                   │
│   ● Deep           preset        A                │  click = recall onto Bass
│     Bright         preset             B           │  A, B = morph ends
│     Verse          snapshot                       │
│ [ + Save preset ]  [ + Snapshot ]                 │  "Bass 3", renamed in place
│ ───────────────────────────────────────────────── │
│ Morph  Deep ━━━━━━━●━━━━━━ Bright                 │  only with A and B set
│ ▸ Sample choices (2)                              │
└───────────────────────────────────────────────────┘
```

* **Scoped to the selection**: the owner (track, bus or master) and a tab for the graph. The lists show the presets
  that can be recalled onto it (`canRecallPresetOn(preset, owner, domain)`, including presets of other owners whose
  graph matches) and the snapshots of that owner and scope. ⋯ has *Show all in project*, which brings back today's
  list.
* **Rows recall on click**, onto the selection. Everything else is in the row's menu, and no row has buttons.
* **Saving**: *+ Save preset* (not on the *Track* tab) and *+ Snapshot* make a sound named after the owner (*Bass 1*,
  *Bass 2*…) and start renaming it in place. No name field, no scope ▾.
* **Morph** takes A and B from rows (*Set as A* / *Set as B*), and shows only when both are set and compatible.
* **Sample choices** collapse, labelled with node titles instead of IDs.
* **Words**: one line in the empty state explains presets and snapshots. No revision IDs.

Out of scope: library presets in Sounds and saving into a library sound (phase 5), and moving sample choices into the
Instrument property editor (later; noted in the backlog).

## Inventory

* `ui/presets/PresetsPanel.tsx` (91 lines) holds `domain`, `name`, `message`, `a`, `b` and `amount` in `useState`.
  Its toolbar is the owner, a *Sound scope* ▾ (*Instrument + notes (presets)*, *Note effects*, *Audio effects*,
  *Whole track + mixer (snapshots)*), *Sound name*, *Save snapshot* and *Save as preset*. Below are two lists of every
  snapshot and preset, each row with *Recall X*, *Update*, *Rename*, *Duplicate* and *Delete*; the A/B fieldset
  (*Snapshot A*, *Snapshot B*, *Snapshot morph*); and *Instance sample choices*, with *Sample binding …* selects.
* **The button and the menu disagree**: a preset row's *Recall preset X* button calls
  `recallPresetOn(s, scope.owner, scope.domain)` (the view's scope), while `sound.recall` recalls onto the preset's own
  scope. `workbench.md` documents this as an exception.
* `state/actions/sound.ts`: *Recall*, *Update*, *Save to library* (phase 2, presets only), *Rename*, *Duplicate* and
  *Delete*, with `canRecallPresetOn` and `recallPresetOn`. The `sound` subject is `{ kind: 'sound', soundId, preset }`.
  An owner's name was drawn by two copies of `ownerName` (`subject-name.ts`, `library-save.ts`).
* Morph uses `morphSnapshots(project, left, right, amount)` and `useControlGesture()`, whose pointer, key, blur and
  unmount cleanup must be kept.
* **Specs** that use the view: `presets.smoke.spec.ts` (2 tests: *Sound scope*, *Sound name*, *Save snapshot*,
  *Recall …*, *Snapshot A/B*, *Snapshot morph*), `views-at-min-size.smoke.spec.ts:89`, `layout.smoke.spec.ts:6`
  (*Sound name* kept while hidden), `context-menus.smoke.spec.ts:253`, `drag-and-drop.smoke.spec.ts:251` and `:311`
  (*Sound name*, *Save as preset*, *Recall preset …*), `library-tree.smoke.spec.ts:20` (two presets saved by name), and
  `automation.audio.spec.ts:61` and `:99` (*Recall preset …*, on the `preset-project.ts` fixture's Sweep).

## Design

### State

`state/sounds-store.ts`:

* `tab`: `'patch' | 'fx' | 'notes' | 'track'`.
* `a` and `b`: snapshot IDs, the morph's ends.
* `showAll`: a boolean, kept in `localStorage` (`sfxlab:sounds-show-all`) as a view preference, through the same
  guarded access the layout uses.

**The tab follows the editors.** When Instrument, Effects or Notes becomes the visible editor (the layout store's
visible views), `tab` switches to its graph. Choosing a tab by hand holds until that happens again. A bus or the master
has *Effects* and *Track* only.

### Actions

* **The `sound` subject gains `onto?: ControlOwner`.** Sounds' rows set it to the selected owner, and `sound.recall`
  recalls onto `onto` when it's given, in the row's domain. The drag payload and other menus are unchanged. This
  removes the button-versus-menu exception, so `workbench.md` loses that paragraph.
* New `sound` actions: *Set as A*, *Set as B* (snapshots only, the `sounds-store`). Phase 2's *Save to library*
  (presets) is already there.
* `nextSoundName(project, ownerName)`: the first *Bass n* not used by a snapshot or preset of that owner.
* **Saving** runs through `editPresetProject`, as today, then `startRename` on the new sound's row.

### The view

`ui/presets/SoundsPanel.tsx` replaces `PresetsPanel.tsx`:

* **Header**: the owner's name, the tabs as a segmented control (`role="tablist"`), and ⋯ (*Show all in project*, as
  a checkable entry).
* **List**:
  * Rows, each an `ActionMenu` trigger: the name (rename in place), a kind label (*Preset* or *Snapshot*), and A/B
    badges. Presets are drag sources, as today.
  * Click and Enter recall; the recalled row shows ● until the next edit of that graph.
  * The status line shows a recall's report ("Recalled 12 controls, 1 missing"), as today.
* **With *Show all***, the rows are grouped under owner and scope headings, as today's labels are. Clicking recalls
  onto the sound's own owner, since there is no single selection to recall onto.
* **Morph**: a slider between the A and B names, with today's gesture handling. It's hidden unless A and B are both
  set and `morphSnapshots` accepts the pair, checked when they're set.
* **Sample choices**: a `<details>` (*Sample choices (n)*), each row named by node titles along the path (*Drum
  sampler / Kick pad*), with today's select.
* **Empty state**: "Save a preset to keep this sound and use it on other tracks; save a snapshot to remember knob
  positions here and morph between them."

## Steps

1. **State and actions.** `sounds-store`, `onto` on the `sound` subject, *Set as A/B*, `nextSoundName`. Unit tests:
   `sound.recall` with and without `onto`; names skip used ones; A/B kept across selection changes only while their
   snapshots exist.
2. **The view.** `SoundsPanel`, removing `PresetsPanel`, the tab following editors, *Show all*, morph from rows,
   sample choices. Smoke: `presets.smoke.spec.ts` rewritten on the new controls (the same two cases: snapshot save,
   recall, morph; preset save and recall onto a compatible second track), and `views-at-min-size`, `layout`,
   `context-menus` and `drag-and-drop` updated.
3. **Docs.** `library-and-presets.md` (the Sounds paragraph), `workbench.md` (the removed exception, the new
   actions). A backlog item for moving sample choices into the property editor. This plan's notes are sorted.

## Behavior changes

Intended: Sounds lists only what fits the selection unless *Show all* is on; rows recall on click onto the selection;
the menu's *Recall* in Sounds recalls onto the selection too; saving names sounds after their owner. Recall, morph,
Touch and Read behave as before. Nothing else.

## Verification

* The usual gates. `npm run test:audio` once at step 2 (the preset recall audio checks).
* Manual:
  * with Low Light playing, save two snapshots of the Bass, set A and B, and morph by mouse and keys;
  * recall a preset onto the Stab with Touch armed;
  * Sounds at 280 × 200;
  * switching editors moves the tab.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Recall target in Sounds | **Always the selection**, through `onto` on the subject | Removes the documented button-versus-menu exception. |
| Tab | **Follows the visible editor; a manual choice holds until the editor changes** | |
| *Show all* | **A ⋯ toggle, kept per browser** | A view preference, not project state. |
| A/B | **Row actions into a small store**; the slider shows only for a compatible pair | |
| Names | ***Bass 1*, *Bass 2*…, then rename in place** | Same as D4 for the library. |
| Sample choices | **Stay in Sounds, collapsed, with readable names**; moving them is a backlog item | |

## Changes made while implementing

* **Inventory re-checked** at `e598c47`. The view and its actions were as listed; the code had moved in three places,
  now in the inventory: phase 2 had already added *Save to library* to a preset's menu, more specs use the view
  (`library-tree`, a second `drag-and-drop` case, `automation.audio`), and the `preset-project.ts` fixture is used
  through `automation.audio`, not by the view's own specs.
* **Step 1:** `nextSoundName(project, owner)` takes the owner, not its name, since only that owner's sounds count;
  `ownerName` is one helper in `actions/lookup.ts` now, in place of two copies. A group's sounds are *Drums 1*.
* **Step 1:** `soundSubject(soundId, preset, onto?)` builds the subject with its keys in one order, since
  `sameSubject` compares JSON: a row's in-place rename has to match the subject a save or its menu started it with.
* **Step 1:** `saveSound(kind, scope, context, onto?)` (in `sound.ts`) names, saves through `editPresetProject` and
  starts the rename with origin `sounds`, and reports "Saved Bass 1".
* **Step 1:** `sound.recall` with `onto` is disabled when the owner's graph isn't the preset's, with the tooltip
  "Lead's graph isn't this preset's". A snapshot ignores `onto`: it holds its own owner's controls, and Sounds lists only
  the selected owner's.
* **Step 1:** *Set as A* and *Set as B* sit in the `open` group after *Recall*, set apart by a separator (the action
  lists keep group order, so the `view` group would put them last).
* **Step 1:** the store keeps the ● mark too (`recalled`: the sound, the scope it went to, and `scopeState` of that
  scope just after). The mark holds while the scope's controls are unchanged; an instrument preset's covers its notes.
  `sound.recall` sets it, so the menu's *Recall* marks the row as a click does.
* **Step 1:** the store follows the layout (`editorTabOf`) and the project (A, B and the mark go with their sound) by
  subscriptions in `sounds-store.ts`, so the tab is right even before Sounds is first shown. `state` doesn't touch
  `localStorage` (as `wave-edit-settings` says), so the view keeps *Show all* per browser.
* **Step 2:** a row is an `li` holding a `role="button"` element (the `ActionMenu` trigger and, for a preset, the drag
  source) named *Recall Bass 1*, described by its kind label (*Preset*, *Snapshot*, *Preset · Sweep* for another
  owner's, the A and B badges, and "recalled" for screen readers). While it renames in place it drops the button role,
  since a field can't sit inside a button. Click, Enter and Space recall; `data-recalled` marks the ● row.
* **Step 2:** the tabs are an instrument track's *Instrument*, *Effects*, *Notes* and *Track*; an audio or return track
  has *Effects* and *Track*, as a bus and the master do (`soundsTabsOf`). `tabFor` shows *Effects* where the chosen tab
  isn't there, and the choice is kept for the next instrument track.
* **Step 2:** the list of presets runs through `recallablePresets(project, owner, domain)`, which captures the owner's
  graph once rather than once per preset (`canRecallPresetOn` per row would capture it 128 times on every knob move).
* **Step 2:** the save buttons read *+ Save preset* and *+ Snapshot*, named *Save preset* and *Save snapshot* for
  assistive tech and specs; their tooltips say what each keeps. The status line says "Saved Bass 1" and a recall's
  report, as before.
* **Step 2:** the rows scroll in their own box, so *+ Save preset*, the morph and the sample choices stay in view at
  280 × 200. At 280 px the header keeps one line and the owner's name gives way to an ellipsis (its tooltip has it).
* **Step 2:** *Show all in project* is a `PopupMenu` checkable entry under ⋯ (*Sounds actions*), a view preference, not
  an action; the view keeps it in `localStorage` under `sfxlab:sounds-show-all` with guarded access. With it, the rows
  are grouped under "Bass · Instrument" headings and recall onto their own owner.
* **Step 2:** the morph shows wherever A and B are set and pair up, whatever the selection, as the plan has it; the
  slider is named *Morph*, between A's and B's names. The sample choices' select is named *Sample for* and the path's node
  titles; "Use shared default" reads *Default (Tone 1)*.
* **Step 2:** specs: the presets spec's two cases are the snapshot case (save named in place, recall, Enter, undo, the
  ● going with the undo, reload, *Set as A/B* and the morph) and a new preset case (saved on Sweep, listed and recalled
  on its copy, not listed on Other, back with *Show all*). Today's in-place rename case is folded into the first, since
  every save now starts one. `fixtures.ts` has `saveSound(page, sounds, kind, name)`. The layout spec's state kept while
  hidden is the status line now (there is no name field), and `automation.audio` checks the sample choice's name.
* **Step 2:** cost on Low Light (17 tracks, dev build): `recallablePresets` 0.13 ms; checking the ● mark
  (`scopeState`) 3.5 ms, run on each project change only while a mark exists. Left as it is.
* **Manual checks** (dev build, Chromium, Low Light): three Kick sounds saved, A and B set from rows, ● on recall; the
  tab followed Effects and Notes being shown; *Show all*; Sounds at 280 px in the sidebar and at 300 px; a preset of the
  Stab recalled with Touch armed while scene 3 played ("3 controls recalled"). An Enter pressed within a frame of
  *+ Save preset* reaches the button before the name field takes the focus, and saves a second sound; a person doesn't
  type that fast, and the specs wait for the field.
* **Step 3:** the notes are sorted: the view, its store and `onto` into `library-and-presets.md`; the subject and the
  removed button-versus-menu exception into `workbench.md`; decisions 100–104; a gotcha (subjects compare as JSON);
  backlog L6 (sample choices in the property editor) and V2 (dragging a preset row out of Sounds); STATUS, the tour,
  and the runbook's queue for the user (wording, and the header at 280 px).
