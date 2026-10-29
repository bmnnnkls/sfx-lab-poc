# Status

Where the project stands, in one page. Updated 2026-10-29. Update it whenever a round or a piece of work lands
(see [dev/doc-workflow.md](dev/doc-workflow.md)).

## Branches and releases

* **`main`** deploys to GitHub Pages on every push. It holds the performance-and-library work, the compressor and the
  demo-release candidate (project v9 at that point). The demo release has **not been tagged**: the
  human listening pass and the tag are still open ([BACKLOG](BACKLOG.md) V9).
* **`feat/ui-redesign`** is the working branch for the workbench redesign: rounds 1 to 11b are done on it and it is
  not merged into `main` yet. It writes project format **v11**, which `main`'s build refuses to open.

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
| Browser MIDI input and learn | Shipped; physical hardware not verified | [midi](architecture/midi.md) |
| Arrangement timeline (prototype) | Shipped; the full editor is round 12 | [clips-and-arrangement](architecture/clips-and-arrangement.md#the-arrangement-clips-on-a-timeline) |
| Samples, audio clips, wave editor (stereo, in-place edits, processes, crossfades) | Shipped through 11b; markers, regions, keys are 11c | [samples-and-wave-editor](architecture/samples-and-wave-editor.md) |
| Snapshots, presets, personal library, `.sfxlib` bundles | Shipped | [library-and-presets](architecture/library-and-presets.md) |
| Workbench: docking shell, views, layouts, actions, drag and drop, command palette, keys | Shipped (redesign rounds 1–6, 9–10) | [workbench](architecture/workbench.md) |
| Offline WAV export | Shipped | [audio-export](architecture/audio-export.md) |
| Example projects (Low Light, Glass Rain, Starter) | Shipped | [guide/examples](guide/examples.md) |

## Now and next

1. **Round 11c: markers, regions and keys** in the wave editor, and *Revert to original*. Specified in
   [active/SPEC-round-11-wave-editor.md](active/SPEC-round-11-wave-editor.md). It still needs its plan.
   [active/SPEC-wave-editor-handling-and-spectrum.md](active/SPEC-wave-editor-handling-and-spectrum.md) (signed off
   2026-10-29) splits it into handling (menu, keys, mouse, a grouped toolbar), markers and regions, and a second pane,
   followed by round 11d: the spectrogram and spectral edits. The first part, handling, needs its plan.
2. **Round 12: the arrangement editor.** Track headers, automation lanes on the timeline (groups too), recording into
   the arrangement. Outline in [active/ui-redesign-roadmap.md](active/ui-redesign-roadmap.md#round-12-arrangement-editor).
3. **Round 13: visual refresh and themes.**
4. **Merge `feat/ui-redesign` into `main`.** Decide whether this happens before round 12, and clear the verification
   debt first ([BACKLOG](BACKLOG.md#verification-debt)).

Outside the redesign, [active/SPEC-effects-round-2.md](active/SPEC-effects-round-2.md) has parts 1–2 done, and
part 3 (Waveshaper and Crusher) is ready to build.

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
* Firefox and Safari for anything in the redesign: Safari loading float WAV, stereo MP3, Shift+F10.
* Manual listening passes for rounds 11a and 11b. The bounce hashes and audio specs stand in for them.
* Physical MIDI keyboards and controllers.
