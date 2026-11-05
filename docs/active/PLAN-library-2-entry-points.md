---
status: active
date: 2026-11-04
note: "Phase 2 of SPEC-library-ux.md: the Library menu and its commands, and dropping tracks, groups, clips, samples and presets from other views onto library folders. Decisions signed off 2026-11-04."
---
# Library phase 2: the Library menu and dragging things in

Phase 2 of [SPEC-library-ux.md](SPEC-library-ux.md) (D3, D16). It builds on
[phase 1](PLAN-library-1-tree.md): the save actions, the `library-root` subject, the `library-folder` drop target and
the store's `request` already exist. Inventory taken at `9b4f2cd`, re-checked at `5b51762` (see "Changes made while
implementing").

## Goal

* A **Library** menu in the transport bar, between *View* and *MIDI*. Its entries name what they will read ("Save
  instrument of Bass to library") and are disabled with the reason when nothing fits. Every entry is also a command,
  so it shows in the palette and can take a key.
* **Dragging in:** a track, group, session clip, sample or project preset dragged from its own view onto a library
  folder or *My library* is saved there. Resting the drag on the Library's tab or activity-bar button opens the
  Library (spring-loaded, as today), and a collapsed folder springs open (phase 1).
* **A project preset can be saved on its own** (*Save to library* in its Sounds row menu). It becomes a library sound
  built from the preset's own revision, holding that one preset.

Out of scope: dragging several things at once (phase 7), the *This project* root (phase 3), and saving a preset into
the library sound it came from (phase 5).

## Inventory

* **Commands** (`state/commands/`): `Command` has `id`, `category`, `title`, `label(context)`, `applies`, `enabled`,
  `choices` and `run`. `CommandCategory` is `'View' | 'Layout' | 'File' | 'Transport' | 'Track' | 'Edit' | 'Help'`.
  `STATE_COMMANDS` lives in `state-commands.ts`, and `COMMANDS` in `ui/commands/registry.ts` adds `viewCommands` and
  `UI_COMMANDS`. `view.show.library` already exists.
* **Menus** (`ui/commands/menus.ts`): `FILE_MENU`, `VIEW_MENU` and `LAYOUT_MENU` are lists of command IDs and
  submenus. `ViewMenu.tsx` is a `PopupMenu` over `useCommandEntries(VIEW_MENU)`. The transport bar renders
  `<FileMenu /> <ViewMenu /> <MidiSettings />` (`TransportBar.tsx:71`).
* **The palette already lists subject actions** for `selectionSubjects()` (the selected region, clip, group, master or
  track, and sample). So phase 1's *Save to library* actions are in the palette when something is selected. The
  menu's commands are for a stable place and for keys.
* **Drag sources in other views**: a filled session slot (`clip`), a sample row (`sample`), a preset row in Sounds
  (`sound` with `preset: true`), a Tracks tree row, a track's name and a group's band (`track`, `group`). The master
  is not a drag source.
* **Phase 1's saves**: `saveToLibrary(source, context)` in `state/actions/library-save.ts` saves into the open folder
  and resolves with an `ActionReport` (a *Show* button). The subject actions are `track.save-to-library` (instrument
  tracks, choices `patch`, `fx`, `notes`), `track.save-effects-to-library` (audio and return), `group.save-effects-to-library`
  (a bus), `master.save-effects-to-library`, `clip.save-to-library` and `sample.add-to-library`. The `library-root`
  subject has *New folder* (top level), *Import .sfxlib…* and *Export all…*; a folder has *New folder inside*.
* **The Library panel already consumes `request` on mount** (its effect runs on mount as well as on change), so step 1
  only relies on it.
* **Capture**: `captureLibraryAsset(catalog, project, scope, name, folderId)` captures the current graph with every
  compatible project preset. There is no capture of a single preset, but `project.assetRevisions` holds each preset's
  revision payload, so one can be built without reading the current graph.

## Design

### Commands and the menu

A new `CommandCategory` value, `'Library'`. In `state/commands/library-commands.ts`:

| Command | Label | Runs |
|---|---|---|
| `library.save-instrument` | *Save instrument of Bass to library* | the selected instrument track's *Save to library ▸ Instrument + notes* |
| `library.save-effects` | *Save effects of Bass to library* (or *of Master*, *of Drums bus*) | the selected owner's effects save |
| `library.save-notes` | *Save note effects of Bass to library* | the selected instrument track's note-effects save |
| `library.save-clip` | *Save clip "Backbeat" to library* | the selected session clip's save |
| `library.save-sample` | *Add sample "Kick" to library* | the selected sample's |
| `library.new-folder` | *New folder* | the *My library* root's *New folder* (inside the open folder, as phase 1 does) |
| `library.import` | *Import .sfxlib…* | sets `request: { kind: 'import' }` and reveals the Library |
| `library.export` | *Export library…* | sets `request: { kind: 'export', selection: all }` and reveals the Library |

* Each save command finds its subject from the selection store, the way `selectionSubjects` does, and runs the subject
  action through `runAction`. So `applies` and `enabled` are `canRunAction` on that subject, and the reason a
  disabled action gives becomes the command's tooltip ("Select an instrument track").
* With no selection of the right kind the label falls back to the title (*Save instrument to library*) and the
  command is disabled.
* `LIBRARY_MENU` in `menus.ts`: the five saves, a separator, *New folder*, *Import*, *Export*, a separator,
  `view.show.library`. `LibraryMenu.tsx` mirrors `ViewMenu.tsx`. The transport bar order becomes File, View, Library,
  MIDI.
* **The request is consumed on mount.** The Library panel is lazy, so a request made before it has ever been shown
  waits in the store; the panel picks it up when it mounts and clears it.

### Saving a preset on its own

`captureLibraryPreset(catalog, project, presetId, folderId)` in `core/library/assets.ts`:

* It reads the preset's revision from `project.assetRevisions` and stores it as a library revision.
* It makes an asset item named after the preset, whose `state` is the preset, and adds no other presets.
* It refuses external routing, as `captureLibraryAsset` does, and checks sample bytes through the same preflight.
* It works even when the preset's owner has since been rewired, because it never reads the current graph.

`PersonalLibrary.savePreset(presetId, folderId)` wraps it as the other saves are wrapped. The `sound` subject gains
*Save to library* (presets only; snapshots carry no graph).

### Drops onto the library

New rows in `drops.ts`, all copy drops (`effect` is always `copy`):

| Payload | Folder or *My library* | *Trash* |
|---|---|---|
| Instrument track | saves *Instrument + notes* there | refuses |
| Audio or return track | saves its effects | refuses |
| Group with a bus | saves the bus's effects | refuses |
| Folder group (no bus) | refuses: "Sum the group to a bus first" | refuses |
| Session clip | saves the clip | refuses |
| Sample | adds the sample | refuses |
| Project preset | saves it on its own (`captureLibraryPreset`) | refuses |

* `accepts` checks kinds, a bus, the clip's existence, and **external routing**: `externalRoutingIn(project, scope)`
  scans the graph and its modules for the first `send`, `trackAudio` or `trackNotes` node and returns it with the track
  it reads, so the cursor refuses up front. It's a node-type scan, cheap enough for `dragover`, and phase 3 reuses it.
  A capture that still fails at run time (missing sample bytes) reports its reason through the toast, as today's save
  buttons do.
* The saved item goes into the folder dropped on, not the open one, and the toast's *Show* reveals it.

## Steps

Each step is one commit, and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green.

1. **Commands and the Library menu.** `'Library'` category, `library-commands.ts`, `LIBRARY_MENU`,
   `LibraryMenu.tsx`, the transport bar, and consuming the request on mount. Unit tests in `commands.test.ts`: labels
   for each selection kind, disabled reasons, and that each save runs its subject action. Smoke: `commands.smoke.spec.ts`
   opens the Library menu, saves the selected track's instrument, and *Import .sfxlib…* opens the review with a file.
2. **Single-preset save.** `captureLibraryPreset`, `PersonalLibrary.savePreset`, and the `sound` action. Unit tests:
   the revision is the preset's, even after its owner is rewired; one preset only; a refused external route; the
   sample preflight.
3. **Drops onto the library.** The drop rows, `externalRoutingIn` and its unit tests. Drop unit tests, one per
   cell. Smoke, in `library-tree.smoke.spec.ts`:
   * drag a session clip onto a folder, through the Library tab's spring-load;
   * drag a Tracks row onto *My library*;
   * a track whose effects read *Track audio* is refused with the reason in the tooltip.
4. **Docs.** `workbench.md` (the menu, the drop table's new column), `library-and-presets.md` (the single-preset
   save), and `dev/common-changes.md` if it lists the menus. This plan's notes are sorted.

## Behavior changes

Intended: the transport bar has a *Library* menu; the palette lists the Library commands; tracks, groups, clips,
samples and presets dragged onto library folders are saved there; Sounds' preset rows have *Save to library*. Nothing
else changes.

## Verification

* The usual gates at every step. Smoke and audio specs run outside the sandbox (see the [runbook](RUNBOOK-library.md)).
* Manual:
  * every menu entry with every selection kind (none, instrument, audio, return, bus, folder group, master, clip,
    sample);
  * keys set on two Library commands in the shortcuts dialog;
  * a preset of Low Light's Bass saved on its own, then inserted into a fresh project, recalls the same sound.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Command category | **A new *Library* category** | The shortcuts dialog groups by category. |
| An instrument track dropped on a folder | **Saves *Instrument + notes*** | The most common intent. Effects and notes alone are in the menu. |
| A project preset dropped or saved | **A new library sound from the preset's own revision, with that preset only** | Until phase 5 links it to the sound it came from. |
| Refusing up front | **Scan for external routing in `accepts`** | Cheap (node types only), and shared with phase 3. |
| *Export library…* | **Exports all of My library** through the bundle dialog | Selection and folders export from the tree. |

## Changes made while implementing

* **Inventory re-checked** at `5b51762`. Phase 1 had already made the save actions, the `library-root` subject and
  consuming `request` on mount, so the plan stood; the inventory now names them. `5b51762` touched only the README and
  `.claude/settings.json`.
* **Step 1:** a command's `tooltip` can be a function of the context (`commandTooltip`), so a disabled save says why
  ("Select an instrument track", "Sum the group to a bus first", "Pad has no note effects"). The menus and the palette
  read it the same way.
* **Step 1:** `useCommandEntries` follows the selection and library stores too, so an open Library menu relabels as the
  selection changes.
* **Step 1:** *Save effects* on an instrument track runs `track.save-to-library` with the `fx` choice; on an audio or
  return track, a bus or the master, their own *Save effects to library*. A group's label is "of Drums bus".
* **Step 1:** *New folder* runs the open folder's *New folder inside*, or *My library*'s *New folder* at the top level.
* **Step 1:** *Export library…* reads the catalog from storage first, since the store's copy is empty until the Library
  has been shown; an empty library says "My library is empty".
* **Step 1:** the *Library* category sits between *Track* and *Edit* in the palette and the shortcuts dialog.
