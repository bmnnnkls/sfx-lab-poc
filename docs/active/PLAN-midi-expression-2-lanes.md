---
status: active
date: 2026-11-06
note: "Part 2 of the pitch bend, aftertouch and CC spec: expression lanes (a new control target, drawn and played in clips, regions and on the timeline, live input overriding them, format v15). Signed off 2026-11-06, every decision as proposed."
---
# Pitch bend, aftertouch and CC, part 2: expression lanes

Status: **plan, signed off** 2026-11-06, every decision as proposed. Written 2026-11-06 on `imp/spec-midi-expression` after part 1
([plan](../archive/midi-expression/PLAN-midi-expression-1-play.md)). Carries out part 2 of the signed-off
[pitch bend, aftertouch and CC spec](SPEC-midi-expression.md) (§ Expression lanes, § Persistence, § Parts). The spec's
decisions are settled and not repeated here; this plan adds only the ones it raises (§ Decisions to sign off). Where it
differs from the spec, it says so.

## Goal

After this part an instrument track's clips, regions and timeline can hold **expression lanes**:

* *+ Lane* in the clip editor and on the timeline offers a **MIDI** group on an instrument track: *Pitch bend*,
  *Pressure*, *CC 1 Mod wheel*, the CCs the track's MIDI CC nodes read, and *CC…* for any other;
* the lanes are drawn, edited, copied, doubled and trimmed with the existing lane editors, and show their values as a
  musician reads them (*+1.4 st*, *Pressure 80*, *CC 74 = 100*);
* they **play**: in the Session from clips, in the Arrangement from the timeline and from regions, and in a bounce; when
  a lane stops, its control goes back to rest;
* **live input on a control a lane is playing overrides the lane** until *Read* or ■, shown in the lane header as a
  parameter's override is;
* files save them as **format v15**; library clips keep them.

**Out of scope** (part 3): recording into lanes, *Recorded CCs*.

## Inventory

What part 2 touches, beyond the [spec's inventory](SPEC-midi-expression.md#inventory) and part 1.

### Control targets

* `ControlTarget` (`core/control/types.ts`) is `graph` or `mixer`; `controlTargetKey` serializes `[owner, kind, …]`,
  with `target.control` for a mixer target. 58 places branch on `kind === 'graph' | 'mixer'` across `core/control`
  (`resolve`, `label`, `edit`, `effective`, `remap`), `core/automation/evaluate`, `core/engine` (`automation`, `engine`,
  `arrangement-automation`), `core/library` (`assets`, `bundle`, `clips`, `link`), `core/persistence`
  (`sanitize-control-values`, `sanitize-midi-mappings`, `sanitize-presets`, `signature-migration`), `core/preset`
  (`assets`, `snapshots`), `core/project` (`edit`, `control-target-remap`), `state` (`actions/control`,
  `actions/timeline-lane`, `preset-actions`), `app/midi-controls` and a few views. Most only need the new kind to fall
  through to "not mine"; the list is checked in step 1.
* `resolveControlTarget` gives a `ParamSpec`, a base, `automatable` and the interpolation. `enumerateControlTargets`
  lists every target of every owner; the two lane pickers filter it (`ui/automation/AutomationEditor.tsx`,
  `ui/arrangement/TimelineLanes.tsx` `AddLaneRow`), as do snapshots (`isSnapshotControl`) and library clip insertion.
* `controlTargetLabel` names a target (*Mixer / volume*, *Instrument / Filter / cutoff*).

### Lanes and the engine

* Lanes are compiled per owner (`compileLanes` in `core/automation/evaluate.ts`): only lanes whose target resolves
  `available` and `automatable` play. `EngineAutomation` evaluates them per sample within a planning horizon and calls
  `Engine.writeAutomation(target, value)`, which collects audio and mixer targets into per-block curves and writes a
  note-graph target at once. On deactivation it writes the override, else the base.
* **Overrides**: `useControlStore.setOverride(target, value)` (main thread) reaches the engine as `automation/overrides`
  through `app/project-sync`; an overridden target's lane isn't evaluated, the override value is written instead.
  `readLane` / *Re-enable automation* release it; ■ clears them all. `status.automation` reports what lanes play
  (`useControlStore.playback`), which the lane headers and MIDI pickup read.

### Persistence and the library

* Lanes are read by `sanitizeAutomation` (`core/persistence/sanitize-automation.ts`) for clips, audio clips, return and
  master slots, the timeline and library validation; it takes targets from `targetOf`
  (`sanitize-midi-mappings.ts`), which MIDI mappings share. A lane of another owner is kept with a warning and doesn't
  play. `CURRENT_VERSION` is 14 (`format.ts`); `migrations.ts` has a step per version; fixtures are in
  `core/persistence/fixtures/`.
* Library MIDI clips keep lanes as `PortableLane`s (`core/library/clips.ts`): a mixer target without its owner, a
  graph target by signature and node index; inserting one rebinds it to the destination track.
  `validate-library.ts` refuses an item whose lanes the sanitizer would change.

## Design

### The target (`core/control`)

* `ControlTarget` gains `{ kind: 'expression'; owner: ControlOwner; control: 'pitchBend' | 'pressure' | 'cc'; cc?: number }`
  (`cc` present exactly when `control === 'cc'`). `controlTargetKey` adds `[control, cc ?? null]`.
* **`resolveControlTarget`:** a missing track is missing, as now; any owner but an instrument track is incompatible
  (*Only an instrument track has pitch bend, pressure and CC*); a CC outside `isExpressionCC` is incompatible. Otherwise
  available and automatable, linear, base 0, with a spec: bend `{ min: −1, max: 1, unit: 'st', format: 'bend' }` shown
  in semitones at the track's range; pressure `{ min: 0, max: 1, format: 'midi7' }` shown 0 to 127; a CC the same
  (decision L6).
* **`enumerateControlTargets`:** for an instrument track, *Pitch bend*, *Pressure*, CC 1, and the CCs its patch's MIDI
  CC nodes read (decision L1). `expressionTargets(project, trackId)` gives the same list for the pickers.
* **Labels:** *MIDI / Pitch bend*, *MIDI / Pressure*, *MIDI / CC 1 Mod wheel* (`ccLabel`).
* **What refuses it:** `editControlBase` (an expression target has no base to edit: *Pitch bend, pressure and CC have no
  saved value*), `projectWithControlValues` and `effectiveControlReadouts` (skip it), MIDI learn and snapshots
  (`isSnapshotControl` false; decision L5), presets. `remapControlTarget` and `control-target-remap` rewrite only the
  owner, so *Duplicate*, moving a region to another track and group/unlink carry lanes as they carry mixer lanes.

### Playing (`core/automation`, `core/engine`)

* `compileLanes` needs no change: an expression lane resolves available on its own instrument track.
* **`Engine.writeAutomation`** writes an expression target **at once**, like a note-graph target, not into a curve
  (decision L2): `TrackRuntime.express(LANE_SOURCE, 0, control, value)`, where `LANE_SOURCE` is a reserved source id
  (`'lane'`) no keyboard has, so a keyboard's release doesn't put a lane's value back. The instrument reads it at the
  next block, as it reads a keyboard's.
* Deactivation writes the override or the base, 0: a clip stopping or a region ending puts the control back at rest.
* The bounce compiles lanes through `diffProject` as now, so an export bends.

### Live input over a lane (`app/midi-input`)

* When the adapter sends a control to a track (part 1's `express`), it checks `useControlStore.playback` and
  `overrides` for that track's expression target. If a lane is playing it, or an override is already set, it also
  calls `setOverride(target, value)` (decision L3); `track/expression` still goes at once, so the sound doesn't wait for
  the override's round trip. The engine then skips the lane and holds the live value until *Read* (`readLane`) or ■,
  and the lane header shows the override as for any target.
* A keyboard's release (part 1) doesn't release an override: the value stays until *Read*, as a mapped knob's does.

### The view (`ui/automation`, `ui/arrangement`)

* Both pickers list the MIDI targets under a **MIDI** heading on an instrument track (an `<optgroup>`), then **CC…**: a
  small number field (0 to 119, not 64) that adds that CC's lane. A CC already laned is listed but disabled, as any
  target with a lane is.
* Values: the point value field and the lane's readout use the new formats (`ui/shared/param-scale` `formatParam`):
  bend `+1.40 st` (at the track's range; a range of 0 shows `±0`), pressure and CCs `0`–`127`.
* Lane names use `controlTargetLabel`.

### Persistence (`core/persistence`)

* **Format v15.** `CURRENT_VERSION = 15`; migration 14 → 15 is the identity (a v14 file has no expression lanes). A
  `v15-midi-expression` fixture: an instrument track with a clip holding a bend lane and a CC 1 lane, a region with a
  pressure lane, a timeline bend lane, and a `bendRange`.
* `targetOf` gains `{ allowExpression }`: `sanitizeAutomation` passes it, `sanitizeMidiMappings` doesn't, so a mapping
  can't name an expression target. An expression target needs `control` one of the three and `cc` an integer 0–119 (not
  64) exactly when `control === 'cc'`; anything else is an invalid lane, skipped with a warning. An expression lane on
  an owner that isn't an instrument track is kept with the existing "unsupported owner" warning and doesn't play, as a
  cross-owner lane now.
* **Library clips** keep expression lanes as portable lanes (the target without its owner, as a mixer lane), and
  insertion rebinds them to the destination instrument track. The library catalog and bundle versions stay at 2
  (decision L4).

## Steps

1. **The target** (`core/control`): the type, key, resolution, specs, label, enumeration, the refusals, remap; go through
   the 58 branches on `kind` and give each the case it needs. Tests: resolution per owner kind, keys, labels,
   enumeration (CC 1 plus the patch's MIDI CC nodes), remap on duplicate and on a region moving tracks.
2. **Playing** (`core/engine`): `writeAutomation`'s expression case, `LANE_SOURCE`, rest on deactivation. Tests: a clip
   bend lane bends a held note per block, a stop puts it back; a timeline lane wins over a region's; a region's lane at
   its phase while it loops; a keyboard's release leaves the lane's value; the bounce equals the live render.
3. **Persistence** (`core/persistence`): v15, the migration, `targetOf`'s option, validation, the fixture. Tests: the
   fixture loads and round-trips; malformed expression targets are skipped with warnings; a mapping naming one is
   refused; a v14 fixture still loads.
4. **The library** (`core/library`): portable expression lanes, insertion onto another instrument track, validation.
   Tests: save and insert a clip with a bend lane; inserting it on an audio track is refused as any MIDI clip is.
5. **Live over a lane** (`app/midi-input`): the override when a lane plays. Tests: with a fake playback entry, a bend
   sets an override and sends `track/expression`; without one, only the command; *Read* releases.
6. **The view:** the MIDI group and *CC…* in both pickers, the value formats.
7. **Browser tests and docs:** below; `architecture/control-and-automation.md` (the target and where it plays),
   `midi.md` (live over lanes), `reference/formats-and-versions.md` (v15 and its fixture); decisions; the spec's status.

## Behavior changes

* Instrument tracks get MIDI lanes in both pickers. A project with one saves as **v15**, which a v14 build refuses to
  open (as every format bump does).
* A clip, region or timeline lane can bend, press or move a CC on its own, and an export plays it.
* Moving the wheel while a bend lane plays takes over the lane until *Read* or ■.

## Verification

* **Unit (`core`):** as in the steps; also that a project with no expression lanes compiles exactly as before
  (`compileAutomation`, `compileTimelineAutomation` unchanged) and that no snapshot or preset picks up an expression
  target.
* **Unit (`app`):** the override rule above.
* **Browser smoke:** add a *Pitch bend* lane in the clip editor, draw two points, undo and redo, reload; add *CC…* 74
  on the timeline; save a clip with a bend lane to the library and insert it on another track.
* **Browser audio (real worklet):** a clip with a bend lane from 0 to +1 over a bar plays a held note rising by the
  bend range (read as a level, as in part 1's test), and a bounce of the clip matches; a live wheel during it overrides
  until *Read*.
* **By hand** (V5): drawing a vibrato with a CC 1 lane into a MIDI CC node on a real patch.

## Decisions to sign off

Signed off 2026-11-06: every decision as proposed.

| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| L1 | Which CCs the pickers list | **Pitch bend, Pressure, CC 1, the CCs the track's MIDI CC nodes read, and *CC…* for any other** | All 118 CCs in the list (long); or only *CC…* |
| L2 | How a lane's value reaches the instrument | **Written at once, like a note-graph target**; the instrument takes it at the next block | Collected into a curve per block like a mixer control (more code, the same block granularity) |
| L3 | How live input overrides a lane | **A control-store override**, set by the adapter when the target plays a lane, so *Read* and the lane header work as for parameters | An override kept in the engine (simpler, but the lane header can't show it and *Read* can't release it) |
| L4 | Library clips with expression lanes | **Kept as portable lanes; catalog and bundle stay at version 2** (an older build refuses such an item, as it would any lane it can't read) | Bump the catalog and bundle versions; or drop expression lanes when saving to the library |
| L5 | Snapshots and presets | **Leave expression out**: it has no saved value | Snapshot the lanes' current values (there is nothing to recall them into) |
| L6 | How values read | **Bend in semitones at the track's range, pressure and CCs 0 to 127** | Everything 0 to 1 (bend −1 to 1), as stored |

## Changes made while implementing

None yet.
