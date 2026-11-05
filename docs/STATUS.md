# Status

Where the project stands, in one page. Updated 2026-11-05. Update it whenever a round or a piece of work lands
(see [dev/doc-workflow.md](dev/doc-workflow.md)).

## Branches and releases

* **`main`** deploys to GitHub Pages on every push. It holds the performance-and-library work, the compressor and the
  demo-release candidate (project v9 at that point). The demo release has **not been tagged**: the
  human listening pass and the tag are still open ([BACKLOG](BACKLOG.md) V9).
* **`feat/ui-redesign`** is the working branch for the workbench redesign: rounds 1 to 11
  are done on it and it is not merged into `main` yet. It writes project format **v13**, which `main`'s build refuses to open.

Current file and storage versions are in [reference/formats-and-versions.md](reference/formats-and-versions.md).

## What exists

| Area | State | Described in |
|---|---|---|
| Session view, clip launcher, scenes | Shipped | [clips-and-arrangement](architecture/clips-and-arrangement.md) |
| Instrument, effects and note graphs; modules; the DSP nodes (compressor, EQ and filter modes among them) | Shipped | [graphs-and-nodes](architecture/graphs-and-nodes.md) |
| Control nodes, front panels, pinned panels | Shipped | [control-nodes-and-panels](architecture/control-nodes-and-panels.md) |
| Stereo, sends and returns, master bus, mixer, Track audio | Shipped | [mixing-and-routing](architecture/mixing-and-routing.md) |
| Track groups, group buses, Tracks tree | Shipped (redesign rounds 7–8) | [tracks-and-groups](architecture/tracks-and-groups.md) |
| Automation (clip, return and master), touch recording | Shipped; no automation on groups yet | [control-and-automation](architecture/control-and-automation.md) |
| Browser MIDI input and learn; recording into Session slots and the Arrangement, overdub, count-in, the metronome | Shipped; physical hardware not verified | [midi](architecture/midi.md) |
| Arrangement timeline: headers, zoom, snap, a position, follow, keys, markers, the loop brace and the transport looping it | Shipped (rounds 12a and 12b); automation lanes and recording are the rest of round 12 | [clips-and-arrangement](architecture/clips-and-arrangement.md#the-arrangement-clips-on-a-timeline) |
| Samples, audio clips, wave editor (stereo, in-place edits, processes, crossfades, grouped toolbar, right-click menu, keys, mouse, markers, regions, the sampler's loop, snap, *Revert to original*, a second pane, a spectrogram, band selection and spectral edits) | Shipped (round 11 done) | [samples-and-wave-editor](architecture/samples-and-wave-editor.md) |
| Snapshots, presets, personal library, `.sfxlib` bundles | Shipped | [library-and-presets](architecture/library-and-presets.md) |
| Workbench: docking shell, views, layouts, actions, drag and drop, command palette, keys | Shipped (redesign rounds 1–6, 9–10) | [workbench](architecture/workbench.md) |
| Offline WAV export | Shipped | [audio-export](architecture/audio-export.md) |
| Example projects (Low Light, Glass Rain, Starter) | Shipped | [guide/examples](guide/examples.md) |

## Now and next

Round 11, the wave editor, is done (2026-10-31), the last part being 11d part 2: a box drawn in the spectrogram
selects a frequency band, and *Band gain…* and *Keep band* change only that band, in the spectrum worker
([plan](archive/ui-redesign/PLAN-round-11d-2-spectral-edits.md)). Its parts: 11a, 11b, 11c in three parts and 11d in
two ([archive/ui-redesign](archive/ui-redesign/README.md)).

1. **Round 12: the arrangement editor.** Track headers, automation lanes on the timeline (groups too), recording into
   the arrangement. Outline in [active/ui-redesign-roadmap.md](active/ui-redesign-roadmap.md#round-12-arrangement-editor);
   the [spec](active/SPEC-round-12-arrangement-editor.md) is signed off (2026-11-01, every decision as proposed). It
   splits the round into 12a (headers and the timeline frame), 12b (markers and the loop), 12c (automation on the
   timeline) and 12d (touch recording into the arrangement). **12a is done** (2026-11-04,
   [plan](archive/ui-redesign/PLAN-round-12a-timeline-frame.md)): headers beside the lanes with M and S, zoom to 256 px a
   beat, a grid and snap, a position to play from, follow, view keys, and the timeline geometry shared with the wave
   editor. **12b is done** (2026-11-04, [plan](archive/ui-redesign/PLAN-round-12b-markers-and-loop.md)): a mark lane
   under the ruler with markers and a loop brace, the engine looping the arrangement sample-accurately, a seek while
   playing that releases held notes and restarts audio in phase, M, L, `[` and `]`, and format v13. 12c (automation on
   the timeline, groups included) and 12d (touch recording into the arrangement) are to plan.
2. **Round 13: visual refresh and themes.**
3. **Merge `feat/ui-redesign` into `main`.** Decide whether this happens before round 12, and clear the verification
   debt first ([BACKLOG](BACKLOG.md#verification-debt)).

Outside the redesign, [active/SPEC-effects-round-2.md](active/SPEC-effects-round-2.md) has parts 1–2 done, and
part 3 (Waveshaper and Crusher) is ready to build.

**MIDI recording part 1 is done** (2026-11-05, [plan](archive/midi-recording/PLAN-midi-recording-1-session.md),
[spec](archive/midi-recording/SPEC-midi-recording.md)): arm instrument tracks (● on their headers, or their menu), and ● on an armed
track's empty slot records the keyboard into a new clip from the next bar; pressing it again ends the take at the next
bar and the clip loops. A fixed length, a metronome (♩, never in an export), latency compensation and a manual offset;
a take is one undo step. Not checked: a real keyboard (V5).

**MIDI recording part 2 is done** (2026-11-05, on `imp/ecstatic-lehmann-5efb9d`, with part 1, neither merged;
[plan](archive/midi-recording/PLAN-midi-recording-2-overdub.md)): ● Rec (F9) overdubs what you play into the clips
playing on armed tracks, pass after pass, each overdub one undo step; a count-in of 1 or 2 bars clicks before a take
from a stopped transport; ● Rec's menu holds the fixed length, the count-in and the metronome level.

**MIDI recording part 3 is done** (2026-11-05, on `imp/midi-recording-part3-plan`, on top of parts 1 and 2, none
merged; [plan](archive/midi-recording/PLAN-midi-recording-3-arrangement.md)): with ● Rec on, ▶ on the arrangement
records every armed track into a new region (red while it records), ● Rec punches in and out, the loop brace merges
passes into one region, takes past 64 bars go on in the next region, and a count-in works there too. Takes recording at
the same time are one undo step, in the Session too. Not checked: a real keyboard (V5).

**The library UX round is done** (2026-11-05, on `feat/library-improvements`, not merged;
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
* Firefox and Safari for anything in the redesign: Safari loading float WAV, stereo MP3, Shift+F10.
* Manual listening passes for rounds 11a and 11b, and a looped sampler (11c-2). The bounce hashes and audio specs stand
  in for them.
* Physical MIDI keyboards and controllers.
* The library round's listening pass and its wording and layout review (V12, V13).
