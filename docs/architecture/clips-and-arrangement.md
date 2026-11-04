# Clips and the arrangement

The piano roll, groove tools, audio clips and the arrangement timeline.

## Editing clips (piano roll)

* **Gestures are pure functions of the pointer.** `ui/clip-editor/note-gestures.ts` describes draw / move /
  resize-start / resize-end as `applyGesture(gesture, pointer, grid) -> notes`, computed from the notes *as they
  were when the drag began*, so results never drift and are unit-tested without a DOM. The note arithmetic itself
  (`moveNotes`, `resizeNotesEnd`, `trimNotesToLength`, …) lives in `core/project/note-edit.ts`.
* **One surface, one hook.** `PianoRoll` is a single pointer-driven element (grid lines are CSS gradients, not
  thousands of cells). `use-piano-roll-interaction.ts` owns the mouse and keyboard behaviour: click-drag on empty
  space draws a note as long as the drag; drag a note to move; drag its end handles to resize; Shift-click
  multi-selects and groups move/resize together (a group is stopped at the clip edges, never squashed);
  double-click or right-click deletes; Delete, arrows (Shift = octave), Ctrl+A, Ctrl+D, Esc work on the selection.
* **A gesture is one undo step.** While dragging, edits live in a local `draft` that is shown on screen and
  committed once on release. That keeps undo per-gesture and avoids sending a clip update to the engine on every
  mouse move. A double-click only deletes when the second click doesn't turn into a drag.
* **Notes have stable ids** (`Note.id`) so selection survives edits and undo, and so the clip launcher can tell
  which notes are sounding. Files from before this get fresh ids on load.
* **Clip length** is in beats (1–256), shown with bars. Lengthening keeps notes; shortening trims notes that no
  longer fit (undo restores them); **Double** doubles the length and repeats the notes into the new half. The length
  field applies on Enter/blur, never per keystroke, because typing "16" would otherwise pass through "1" and trim.
  Long clips get horizontal zoom (slider or Ctrl+wheel), a bar ruler and a sticky keyboard.
* **Editing a playing clip never leaves a note stuck.** The launcher remembers which notes it has started. When
  `syncClips` swaps in edited clip data it releases any sounding note that was deleted, moved, re-pitched or cut
  short, and lets one that merely got longer ring to its new end. Without this, deleting a held note would
  leave its voice sounding forever (its note-off is never generated).
* No-op edits return the same project object (`updateTrack`/`editClipAt`), so they don't create empty undo steps.
* **Clip references.** The clip setters (`setClipNotes`, `setClipLength`, `doubleClip`, `updateAudioClip`) take a
  `ClipRef` (`core/project/clip-ref.ts`): `{ kind: 'session', trackId, clipId }` or `{ kind: 'region', regionId }`.
  `editClipAt(project, ref, change)` edits a session clip in its slot or a region's own `content`, and `clipAt` reads
  one. So Clip edits a selected region's copy the same way it edits a session clip, and never its session source.
  Lengthening a region in Clip lets it overlap the next one, as resizing its edge does. A region shows no automation
  toggle and no playhead in Clip yet (the timeline plays neither; round 12): its content keeps its source's id, so
  the piano roll and the waveform are told not to follow the session launcher (`playhead={false}`).
* **Velocity lane** (`VelocityLane.tsx`, pure picking logic in `velocity-lane-logic.ts`): one bar per note under the
  roll. Press a bar and drag; if the note is selected the whole selection follows. Chords put several bars at one x,
  so the bar whose top is nearest the pointer wins. Same draft-then-commit pattern as the roll (one undo step).
* **Marquee select:** Ctrl/Cmd-drag on empty space draws a box (Shift adds to the selection); plain drag still draws a
  note. `notesInRegion` / `marqueeRegion` are pure.
* **Copy / cut / paste** (Ctrl+C/X/V, Ctrl+D duplicates): the clipboard (`note-clipboard.ts`, a `createClipboard`
  store; see "Actions and context menus") is in memory so notes can move between clips. Paste lands under the
  **mouse pointer** (not the last click, since clicking empty space draws a note), and repeated pastes with the mouse left alone follow on after each other. Pasted notes get fresh ids and
  anything past the clip end is dropped (`pasteNotes`).
* **Audition:** placing a note, grabbing one, dragging it to a new pitch, or nudging with the arrows plays it through
  the track's own instrument (`track/audition` -> `TrackRuntime.auditionNote`: a 0.3 s note on the track's voice pool,
  so you hear the real patch, even while stopped). Resize handles stay silent. Toggle in the toolbar.
* **Follow playhead** scrolls a long clip along with playback. `Playhead` owns its status subscription so the roll
  itself does not re-render 30x a second; the static parts (keys, ruler, pitch rows, notes) are memoised.
* **Remembered UI preferences:** grid, zoom, audition, follow and lane visibility are kept in `localStorage` via
  `useStoredState` (guarded, validated, falls back to defaults). The panel's height is part of the saved layout (see
  [Layout and navigation](workbench.md#layout-and-navigation)).

## Groove: quantize, swing, humanize

Pure functions in `core/project/groove.ts`, applied by the **Groove** dropdown (and `Q`, and the context menu) to the
selected notes, or the whole clip when nothing is selected, using the toolbar grid. Each Apply is one undo step, and
applying something that changes nothing adds no undo step (`setClipNotes` keeps project identity when notes are equal).

* **Quantize** moves starts (optionally ends) toward the grid by *strength* 0–100 %, so partial strength keeps some of
  the original feel. At 100 % it is idempotent. Notes are kept inside the clip.
* **Swing** snaps notes to the grid then delays every other slot: *amount* is where the second step of each pair lands
  (50 % straight, ~67 % triplet, 75 % hard shuffle). It is idempotent at every amount: a note is matched to the slot it
  is closest to *as currently placed, delayed or not*. (Re-rounding the raw position broke this at 75 %, where the
  off-beat sits exactly halfway between two slots.)
* **Humanize** adds random timing wobble (up to half a grid step at 100 %) and velocity wobble (up to a quarter of the
  range). The random source is injectable (`random`), so tests reproduce results; in the app each press is a new roll.
* Amounts are remembered (`sfxlab:groove`, validated on load). The panel stays open across Undo/Redo clicks so
  "try, undo, try again" works; it closes on Escape or a click elsewhere in the editor.

## Audio clips

An **audio track** holds clips that play a library sample in the session grid: launched on the next bar, in time with
the transport, optionally looping. A track is now one of two kinds (as in Ableton): an **instrument track** (MIDI clips
through a patch, as before) or an **audio track**.

* **Model.** `Track` is a discriminated union (`kind: 'instrument' | 'audio'`; `isInstrumentTrack` / `isAudioTrack`).
  An `AudioClip` is `{ sampleId, lengthBeats, loop, warp, gain, start, end, fadeIn, fadeOut }`. Instrument-only edits (`setClipNotes`,
  `setTrackVoices`, …) leave audio tracks untouched. Removing a library sample removes the audio clips that used it
  (and clears sampler nodes); undo restores both. Files from before this have no `kind` and load as instrument tracks.
* **Tempo without time-stretching.** `warp: 'repitch'` (default) says the clip spans `lengthBeats` and speeds the
  sample up or down to fit at the current tempo, like Ableton's Re-Pitch mode, so it stays in time at the cost of
  pitch following speed (the editor says so: "×0.92 speed (−1.5 semitones) at 110 BPM"). `warp: 'off'` plays at
  original speed regardless of tempo. A sample's length in beats is guessed from a tempo in its file name
  ("… 98 BPM") or else the project tempo; **Fit to tempo** redoes that guess. Real time-stretch is not implemented.
* **Phase-locked, never accumulated.** In re-pitch mode the read position is *derived from the transport beat*
  (`repitchPosition`: `(beats since start mod length) / length × sample length`), not advanced sample by sample. So a
  loop cannot drift, and tempo changes mid-clip are seamless. This is covered by a test that changes tempo five times
  while playing and checks every block against the beat clock.
* **Trim and fades.** `start`/`end` are fractions (0..1) of the sample that the clip plays (minimum region 0.2 %);
  `lengthBeats` spans the *region*, so trimming a 4-beat loop to its back half and fitting gives 2 beats. Re-pitch
  position is `start + phase × (end − start)`, still derived from the beat clock; looping wraps within the region
  (interpolating back to the region start, so there is no read past the end). `fadeIn`/`fadeOut` are seconds of
  sample time at the region edges (default 2 ms, max 2 s, each capped at half the region). To avoid clicks when a clip
  is stopped, replaced or edited out, the engine does not cut it: the old voice becomes a 5 ms **tail** that fades
  out while the new one starts. Old files load with the whole sample and no fades. In the editor, handles drag with
  pointer capture (one undo step per drag via a merge key), excluded parts are dimmed, and the beat grid and playhead
  are laid over the region only.
* **One launch state machine for both kinds.** `LaunchQueue` (queued launch/stop applied at the next bar boundary,
  clip edits swapped in by id) is shared by `ClipLauncher` (adds note events and held-note tracking) and
  `AudioClipLauncher` (just `start` / `stop` at a beat). The 12 original MIDI-launcher tests passed unchanged through
  the extraction.
* **Engine.** Both runtimes implement `PlayableTrack` (launch, status, `schedule(from, to)`, `mixInto`). `schedule`
  returns actions pinned to a beat; the engine runs each at its exact sample, so an audio clip starts on the bar
  line to the sample (tested). `mixInto` receives a `MixTiming` (beat at the segment start, beats per sample), which
  is how audio stays on the grid. What *sounds* is reported by the player, not the queue, so a finished one-shot stops
  showing as playing. Commands: `track/add` has a `kind`; audio clips travel as `track/setAudioClips`.
* **UI.** The session `+` is a menu (instrument or audio track); an empty audio slot's `+` lists the library samples,
  as does its right-click *Add audio clip* ▸; audio slots show a mini waveform and share the clip menu. `AudioClipEditor` shows the waveform across the clip's
  length with the beat grid over it (kicks on beats 1 and 3 line up visibly), a playhead, and controls for sample,
  warp, loop, length, fit and gain. The Samples tab has *New audio track*. Instrument-tab content for an audio track
  explains it has no instrument. A 120 BPM demo drum loop ships in **Add demo samples**.
* **Menus.** `ui/shared/menu` holds `ContextMenu` (right-click) and `PopupMenu` (click on a trigger), both over Radix
  with one shared entry renderer and stylesheet, so they look and behave identically (see "Actions and context
  menus").

## The arrangement (clips on a timeline)

A second main view beside the session grid: copies of session clips placed on a timeline, one lane per track, with
the tracks' headers beside them, as in Ableton's **Arrangement** view. The transport bar toggles (Session |
Arrangement), and Tab switches views like in Ableton.

* **Model.** An `ArrangementClip` (`core/project/arrangement-clip.ts`) is `{ id, trackId, startBeat, content, loop? }`
  where `content` is a *copy* of a session clip (a MIDI clip or an audio clip), independent of the session grid
  afterwards. Regions may overlap on one track (both play; the newest start wins for audio). `Project.arrangement`
  is optional, so files from before this load unchanged (no format-version bump).
* **The timeline's bound.** No region ends past `MAX_TIMELINE_BEATS` (4096 beats, 1024 bars of 4/4,
  `core/project/limits.ts`): `createArrangementClip` and `updateArrangementClip` clamp `startBeat` through
  `clampStartBeat`, and the sanitizer drops a region past it with a warning. `timelineEnd(regions)` is the last beat
  any region sounds (its loop end); the view draws at least 32 bars and 4 past it.
* **Files.** `sanitizeArrangement` keeps a region's `loop` (only a real `true`), and drops a region whose track or
  sample is missing.
* **Playback.** Which regions sound is *derived from the transport position*, not queued: `ArrangementPlayer`
  (`core/engine/arrangement-player.ts`) has one `ArrangementNotes` / `ArrangementAudio` per track that emits the
  events of the regions overlapping each beat range. A MIDI region plays **once** (notes are cut at its end, and
  released on the range that crosses it); an audio region is phase-locked to its timeline start exactly like
  session clips (`AudioEvent.origin` is the loop base the player derives its read position from) and stops at its
  end. A seek plays what is under the playhead: audio joins in phase, notes that start after the seek position fire.
* **Looping regions.** A region with `loop: true` repeats its clip on the timeline: the pass math of
  `ClipLauncher.clipEvents` (one pass per clip length, notes cut at the pass end, the pass index part of the note
  identity) applied per region, until `arrangementLoopEnd` — the start of the **next region on that track** (any
  region, looping or not, cuts the loop; a pass the loop end falls into is cut short there). A looping region with
  no next region stops at its own end. An audio region loops via the start event carrying a looping clip
  (`{ ...clip, loop: true }`), so the read position wraps each pass; its stop event moves from the region end to
  the loop end.
* **Each region plays on its own track.** `arrangement/set` carries every track's regions; each track runtime
  filters to its own (`setArrangement`), so a region never leaks onto another track's player.
* **Two playback modes.** The engine holds `playbackMode: 'session' | 'arrangement'`; every track runtime follows
  one source at a time and releases the other's notes (with a 5 ms tail for audio) on `setMode`. `arrangement/play`
  (with an optional `fromBeat`) switches to the arrangement; `transport/play`, `clip/launch` and `scene/launch`
  switch back to the session. `EngineStatus.mode` says which plays, so the arrangement's playhead shows only while
  the timeline plays. A track added mid-arrangement follows the timeline like the rest. `arrangement/set` pushes the
  whole region list (it is small, and edits create new arrays).
* **The view's layout** (`ui/arrangement/`). A toolbar over **one scroller** for both axes. Its content is a grid of the
  header column and the timeline; the headers are `position: sticky` at its left and the ruler row at its top, so a
  sideways scroll moves only the timeline and an up-and-down one moves headers and lanes together, with no script to
  keep them in step. The scroller's `scroll-padding` is the header column and the ruler, so what scrolls into view
  lands beside them, not behind them. The rows come from `arrangementRows(project)` (`core`): `visibleRows` without the
  returns, each track with its group's colour, memoized like `trackRows`.
* **Headers.** A track's header has its name (click or Enter selects the track, marked while selected), and the
  mixer's `MuteSolo` (`ui/shared/MuteSolo.tsx`: lit for the row's own flag, half lit through a group); a muted row's
  name is struck through. A group's header has its fold twisty, its name (selects the group), a *bus* tag on a bus and
  `GroupMuteSolo`; folded, its row shows its members' regions as thin bars. A header carries the track's or group's
  menu, drags to reorder (before or after by halves, into a group by its middle third) and takes presets as the
  session's does. The header column is 180 px, resized from 120 to 320 by the splitter at its right edge (← and → move
  it by 10 px, a double-click returns it to 180); below 600 px of view it is drawn at 120 px. Track rows are 56 px high,
  group rows 28.
* **The ruler and the lines.** The ruler is a canvas the size of the visible timeline, sticky at the timeline's left
  edge, redrawn in an animation frame on scroll, zoom and resize: bar numbers, and beats and sixteenths
  (`formatBeat`) as the zoom allows, at least 72 px apart (`ticks` from `ui/shared/timeline`, steps up to 2048 beats).
  The lanes' bar and grid lines are CSS gradients sized by `--bar-px` and `--grid-px` (`gridSpacing`): grid lines
  closer than 4 px aren't drawn, and bars that close show every fourth.
* **Zoom and scroll.** The zoom is pixels per beat, from the whole drawn timeline in the visible width (never below
  0.05) to 256. ⌘ or Ctrl with the wheel, and a pinch, zoom around the pointer: the store's zoom changes, and a layout
  effect sets `scrollLeft` so the beat under the pointer stays (`useTimelineZoom`). The toolbar's slider is
  logarithmic. *Zoom to fit* shows from 0 to `timelineEnd` (32 bars when empty); *Zoom to selection* shows the
  selected region with a bar each side. Both are asked of the store (`zoom`) and applied by the view once it knows its
  width (`takeZoom`). The plain wheel scrolls; a middle-drag pans both ways. A region dragged within 24 px of the
  timeline's side, or past it, scrolls it each animation frame (`autoScrollUnits`) and keeps following the pointer's
  beat.
* **The view's settings** (`state/arrangement-view-store.ts`, `useArrangementView`): the zoom, the grid, follow and the
  header width, kept per browser as one object under `sfxlab:arrangement-view` (the old `sfxlab:arrangement-zoom` is
  read once when it is absent); the position, in memory. None of it is in the project or undone.
* **Snap.** The toolbar's *Grid* (*Bar*, *Beat*, *1/2*, *1/4*, *1/8*, *1/16*, *Off*; 1/4 by default) snaps drops, the
  right-click's beat, region moves and resizes and the position. A moved or resized region's edges also snap to every
  other region's start and end, on any lane, within 8 px (`regionSnapping`, `snapBeat`); the nearer of a grid line and
  an edge wins. A moved region snaps its end instead of its start when the end is the nearer to something
  (`snapRegionStart`), so it can be dragged to end at a bar. Alt held during a drag (or at a click or drop) snaps to
  nothing.
* **The position** is where arrangement playback starts: a dashed line over the lanes and a mark in the ruler. A click
  in the ruler sets it, on the grid; while the arrangement plays, the click also seeks there. ▶ *Arrangement* plays
  from it; ■ stops and leaves it, so ▶ plays from the same place again; ■ while stopped puts it back at 0
  (`state/arrangement-transport.ts`). The transport bar's ▶ and Space play the session, as before.
* **Follow** (*Follow*, on by default): when the playhead leaves the visible timeline, the view scrolls so it sits 15%
  in, as the piano roll's does. The playhead writes `scrollLeft` from its own effect, so following renders nothing
  else. A sideways scroll by the user while the arrangement plays (a wheel, a trackpad, a middle-drag, a zoom, the
  scrollbar) pauses follow until the next ▶ or the toggle, and the button shows half lit (`data-paused`). Follow's own
  scrolls are told apart by where it last scrolled to, kept on the scroller (`followTo`); the playhead checks that mark
  before it scrolls (`movedSinceFollow`), since its next frame can come before the scroll event, and forgets it when
  playback stops or follow is turned on again.
* **Keys.** The timeline takes the focus on a press on the lanes or the ruler (it is focusable, with a focus ring), and
  its view keys are one pure function, `timelineKeyAction` (`timeline-keys.ts`), listed read only under *Arrangement*
  in the shortcuts dialog: ← → move the position a grid step (a beat with the grid off), onto the grid; Alt with them a
  tenth of the view; Home and End to 0 and to `timelineEnd`; + (=) and − zoom by two wheel notches around the position
  (the middle when it is out of view); Z zooms to the selected region, Shift+Z to fit; F follows or stops. A key that
  moves the position out of view scrolls by the least that shows it. Only a key pressed on the timeline itself is
  taken: a region, a header's buttons and fields keep theirs, and Space stays the transport's.
* **Regions** are DOM elements placed in pixels, drawn as a note preview (MIDI, at most 200 notes) or a waveform
  thumbnail (audio). **Drag a session slot onto a lane** to copy it there at the snapped beat (see
  [Drag and drop](workbench.md#drag-and-drop)); in the default layout, where Session and Arrangement share a tab group,
  hold the drag over the Arrangement tab to show it. Right-click an empty lane to place one of the track's session clips
  at the clicked beat (*Add clip* ▸), add a sample's clip on an audio lane (*Add audio clip* ▸), paste a copied clip or
  region there, or clear the track. A session slot's menu keeps **Place on arrangement**, which appends a copy at the
  end of its track's timeline: the keyboard's route. Drag a region to move it, and vertically onto another lane to move
  it across tracks: the lane under the pointer (its `data-lane`) shows accept or refuse (`data-drag-over`), and a lane
  of the other kind of track (`clipFitsTrack`: a MIDI region over an audio track) refuses it. Drag its edge to resize
  (MIDI clips trim their notes). **Selecting a region**: pressing it selects it in the selection store, with its track,
  so Instrument, Effects, Notes and Sounds follow, and Clip shows its own copy if Clip is showing; double-click, Enter
  (regions are focusable) or the menu's *Edit* open it in Clip (`openRegion`). Right-click a region to edit it, open
  its session source (*Edit session clip*, while it exists), duplicate, loop (until the next region: a repeat badge and
  a hatched span up to the loop end), copy or delete. The region is the menu's `asChild` child, so it forwards the
  trigger's handlers, `data-state` and `ref` onto its root element — a component that drops them silently never opens
  the menu. Regions render live while the transport runs. Every edit is an undoable project step
  (`addArrangementClip` / `updateArrangementClip` / `removeArrangementClip`), a drag merging into one step.
* **One playhead** for all lanes, in an overlay over the lanes and under the headers, owning its status subscription.
* **Bouncing.** File > Export audio offers an **Arrangement** scope (see "Exporting audio"): the timeline renders
  from beat 0 to the last region's end, then the usual tail.
* **Not yet.** Markers and a loop brace, automation lanes on the timeline, and recording into the arrangement.
