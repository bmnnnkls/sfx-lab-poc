# Status

Where the project stands, in one page. Updated 2026-11-06. Update it whenever a round or a piece of work lands
(see [dev/doc-workflow.md](dev/doc-workflow.md)).

## Branches and releases

* **`main`** deploys to GitHub Pages on every push. It holds the performance-and-library work, the compressor and the
  demo-release candidate (project v9 at that point). The demo release has **not been tagged**: the
  human listening pass and the tag are still open ([BACKLOG](BACKLOG.md) V9).
* Everything below is on `main`: the workbench redesign up to round 12c, the library UX round (`397460c`, PR #8), MIDI
  recording, and pitch bend, aftertouch and CC (`84a25b3`, PR #9). `main` writes project format **v15**.
* **`feat/round-12d-touch-arrangement`** adds round 12d, touch recording into the arrangement, on top of `main`; not
  merged yet. No format change.

Current file and storage versions are in [reference/formats-and-versions.md](reference/formats-and-versions.md).

## What exists

| Area | State | Described in |
|---|---|---|
| Session view, clip launcher, scenes | Shipped | [clips-and-arrangement](architecture/clips-and-arrangement.md) |
| Instrument, effects and note graphs; modules; the DSP nodes (compressor, EQ and filter modes among them) | Shipped | [graphs-and-nodes](architecture/graphs-and-nodes.md) |
| Control nodes, front panels, pinned panels | Shipped | [control-nodes-and-panels](architecture/control-nodes-and-panels.md) |
| Stereo, sends and returns, master bus, mixer, Track audio | Shipped | [mixing-and-routing](architecture/mixing-and-routing.md) |
| Track groups, group buses, Tracks tree | Shipped (redesign rounds 7–8) | [tracks-and-groups](architecture/tracks-and-groups.md) |
| Automation (clip, return and master, and on the arrangement's timeline for every owner, group buses included), touch recording into clips, slots and the timeline | Shipped (the timeline lanes in round 12c, touch into them in 12d) | [control-and-automation](architecture/control-and-automation.md) |
| Browser MIDI input and learn; recording into Session slots and the Arrangement, overdub, count-in, the metronome; pitch bend, pressure and unmapped CCs played live, drawn as lanes and recorded with the notes | Shipped ([spec](archive/midi-expression/SPEC-midi-expression.md)); physical hardware not verified | [midi](architecture/midi.md) |
| Arrangement timeline: headers, zoom, snap, a position, follow, keys, markers, the loop brace and the transport looping it, rows for returns and the master, automation lanes, a region's own lanes playing, touch recording into the lanes | Shipped (round 12, 12a to 12d) | [clips-and-arrangement](architecture/clips-and-arrangement.md#the-arrangement-clips-on-a-timeline) |
| Samples, audio clips, wave editor (stereo, in-place edits, processes, crossfades, grouped toolbar, right-click menu, keys, mouse, markers, regions, the sampler's loop, snap, *Revert to original*, a second pane, a spectrogram, band selection and spectral edits) | Shipped (round 11 done) | [samples-and-wave-editor](architecture/samples-and-wave-editor.md) |
| Snapshots, presets, personal library, `.sfxlib` bundles | Shipped | [library-and-presets](architecture/library-and-presets.md) |
| Workbench: docking shell, views, layouts, actions, drag and drop, command palette, keys | Shipped (redesign rounds 1–6, 9–10) | [workbench](architecture/workbench.md) |
| Offline WAV export | Shipped | [audio-export](architecture/audio-export.md) |
| Example projects (Low Light, Glass Rain, Starter) | Shipped | [guide/examples](guide/examples.md) |

## Now and next

Round 12, the arrangement editor, is done (2026-11-06), the last part being 12d: while the arrangement plays and
● *Touch* is armed, moving a control records it into its owner's timeline lane (groups with a bus included), over loop
passes, a take an undo step; armed recall records there too ([plan](archive/ui-redesign/PLAN-round-12d-touch-arrangement.md)).
Its parts: 12a (headers and the timeline frame), 12b (markers and the loop, v13), 12c (automation on the timeline,
v14) and 12d, from one [spec](archive/ui-redesign/SPEC-round-12-arrangement-editor.md)
([archive/ui-redesign](archive/ui-redesign/README.md)). Its hand pass is BACKLOG V11.

1. **Round 13a: UI foundations**, next (design tokens, no hard-coded colours, the theme mechanism with light and
   high-contrast token sets, one icon set, shared control states;
   [roadmap](active/ui-redesign-roadmap.md#round-13a-ui-foundations-before-the-engine-pi)).
2. **The engine-improvements PI** ([report](active/REPORT-engine-gaps.md), BACKLOG X1). It starts by accepting the
   [ADR drafts](decisions/adr/README.md), written 2026-11-06 and all *proposed*. It prepares the flagship synth and
   its Factory library ([report](active/REPORT-flagship-synth.md), BACKLOG X2).
3. **Round 13b: the design pass**, after the PI
   ([roadmap](active/ui-redesign-roadmap.md#round-13b-the-design-pass-after-the-engine-pi)).

Outside the redesign, [active/SPEC-effects-round-2.md](active/SPEC-effects-round-2.md) has parts 1–2 done, and
part 3 (Waveshaper and Crusher) is ready to build; under the PI's ADRs it would gain anti-aliasing (ADR-0011). Its
chorus section was corrected on 2026-11-06: a chorus built from the Delay steps once per block.

**MIDI recording part 1 is done** (2026-11-05, [plan](archive/midi-recording/PLAN-midi-recording-1-session.md),
[spec](archive/midi-recording/SPEC-midi-recording.md)): arm instrument tracks (● on their headers, or their menu), and ● on an armed
track's empty slot records the keyboard into a new clip from the next bar; pressing it again ends the take at the next
bar and the clip loops. A fixed length, a metronome (♩, never in an export), latency compensation and a manual offset;
a take is one undo step. Not checked: a real keyboard (V5).

**MIDI recording part 2 is done** (2026-11-05;
[plan](archive/midi-recording/PLAN-midi-recording-2-overdub.md)): ● Rec (F9) overdubs what you play into the clips
playing on armed tracks, pass after pass, each overdub one undo step; a count-in of 1 or 2 bars clicks before a take
from a stopped transport; ● Rec's menu holds the fixed length, the count-in and the metronome level.

**MIDI recording part 3 is done** (2026-11-05; [plan](archive/midi-recording/PLAN-midi-recording-3-arrangement.md)): with ● Rec on, ▶ on the arrangement
records every armed track into a new region (red while it records), ● Rec punches in and out, the loop brace merges
passes into one region, takes past 64 bars go on in the next region, and a count-in works there too. Takes recording at
the same time are one undo step, in the Session too. Not checked: a real keyboard (V5).

**Pitch bend, aftertouch and CC, part 1 is done** (2026-11-06;
[plan](archive/midi-expression/PLAN-midi-expression-1-play.md),
[spec](archive/midi-expression/SPEC-midi-expression.md)): the pitch wheel bends what a keyboard plays by a per-track range (*Bend ±* in
MIDI settings, ±2 by default); pressure (polyphonic pressure folded in) and the CCs no mapping takes reach patches
through the Note node's *Pressure* and *Bend* and a new MIDI CC node; Panic, ■, a disconnect and routing put them back
at rest. Not checked: a real keyboard (V5).

**Pitch bend, aftertouch and CC, part 2 is done** (2026-11-06;
[plan](archive/midi-expression/PLAN-midi-expression-2-lanes.md)): an instrument track's clips, regions and timeline can
hold *Pitch bend*, *Pressure* and CC lanes (*+ Lane* has a **MIDI** group and *CC…* for any CC), shown in semitones and
0 to 127. They play in the Session, the Arrangement and a bounce, back to rest when they stop; moving the wheel over a
playing lane takes it over until *Read* or ■. Files save as **format v15**; library clips keep the lanes. Not checked:
a real keyboard (V5).

**Pitch bend, aftertouch and CC, part 3 is done** (2026-11-06;
[plan](archive/midi-expression/PLAN-midi-expression-3-recording.md); the spec and its three plans are archived): ●
records the pitch bend, pressure and mod wheel that reach an armed track, and the CCs ticked under *Recorded CCs* in
MIDI settings, as lanes of the slot take's clip, the overdubbed clip or the Arrangement take's regions, in the take's
one undo step. Spans are written as they end and once a bar; an overdub pass replaces only its spans; a lane past 2048
points stops with a notice while the notes go on. While a take records a control, the wheel owns it over the lane being
written. Not checked: a real keyboard (V5).

**The library UX round is done** (2026-11-05, merged in PR #8;
[spec, plans and runbook](archive/library-ux/SPEC-library-ux.md)). The Library is one tree with four roots: *This
project* (the open project's graphs, presets, clips and samples, live), *My library*, a read-only *Factory* of 49
sounds, effects and clips from the examples, loaded lazily, and *Trash*. Things get in from every menu, the transport
bar's *Library* menu and by dragging, with external routing refused and the reason shown; they drag out onto tracks,
slots and graphs, several at once inside the tree, and cut, copy and paste with ⌘X, ⌘C and ⌘V. Sounds shows the
selection's presets and snapshots, and *From the library* the presets of the library sound it came from, through a
link that survives duplicates and copies and saves new presets back. Not checked: the listening pass and the wording
review (backlog V12, V13), Firefox and Safari (V2).

## Accepted limits

These were accepted on purpose and are not bugs to rediscover. The evidence is in
[archive/2026-10-perf-library](archive/2026-10-perf-library/) and [measurements/f1-fix](measurements/f1-fix/README.md).

* **First audio callback 3.265 ms against a 2.667 ms budget** in the constant-case capacity run, and **+27/+30%
  overhead on a one-track project with no automation lanes**. Accepted for the demo release on 2026-10-23. The strict
  F1/R1 performance gate is still unmet, and the C6 measurement campaign was not approved.
* **Muting a track does not suspend its DSP.** Dense projects can exceed the audio callback budget.
* The deliberate POC limits are listed in [reference/limits.md](reference/limits.md).

## Not verified

Each of these is a backlog item:

* Keyboard shortcuts pressed by hand in Chrome, Firefox and Safari (round 10). Every cell of that round's browser
  table is still "not checked".
* The wave editor's keys, middle-drag, edge drags, auto-scroll and Shift+F10 menu by hand (round 11c-1), and its
  mark drags, Alt with a drag, rename in place and folded mark lane (round 11c-2), and the spectrogram's colors, scale
  and fill-in (round 11d-1); Playwright drove them in Chromium only.
* The arrangement's headers, zoom, snap, follow and keys by hand (round 12a): sticky headers on a trackpad, pinch,
  middle-drag on a mouse, auto-scroll, the keys with the focus on the timeline, a region and a field; Playwright drove
  them in Chromium only.
* Touch into the timeline by hand (round 12d): a trackpad and a MIDI controller's knob over a loop at two tempos, a
  seek while touching, the feedback in both themes; Playwright drove it in Chromium only.
* Firefox and Safari for anything in the redesign: Safari loading float WAV, stereo MP3, Shift+F10.
* Manual listening passes for rounds 11a and 11b, and a looped sampler (11c-2). The bounce hashes and audio specs stand
  in for them.
* Physical MIDI keyboards and controllers.
* The library round's listening pass and its wording and layout review (V12, V13).
