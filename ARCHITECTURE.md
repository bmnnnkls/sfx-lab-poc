# Architecture

How SFX Lab is built, one subsystem per file under [`docs/architecture/`](docs/architecture/). These files describe
what the code does **now**. Plans, reviews and history are in [`docs/archive/`](docs/archive/), and open work is in
[`docs/BACKLOG.md`](docs/BACKLOG.md). The map of all the documentation is [`docs/README.md`](docs/README.md).

Start with the [overview](docs/architecture/overview.md): the layers, what each `core` module owns, and how an
edit reaches the audio thread.

| File | Covers (former sections of this file) |
|---|---|
| [overview.md](docs/architecture/overview.md) | Layers · `core` modules · Data flow |
| [graphs-and-nodes.md](docs/architecture/graphs-and-nodes.md) | Polyphony · The keyboard's wheel, pressure and CCs · Modulation and effects nodes · Modules (reusable sub-patches) · The note graph (MIDI effects) · Delay timing and tempo transitions |
| [control-nodes-and-panels.md](docs/architecture/control-nodes-and-panels.md) | Control nodes, parameter sockets and the global stage · Front panel · Pinned panels |
| [control-and-automation.md](docs/architecture/control-and-automation.md) | Shared control targets and effective values · Clip and return/master automation · Touch automation recording |
| [midi.md](docs/architecture/midi.md) | MIDI parsing · Held-note engine input · Browser MIDI input and learn · Pitch bend, pressure and CC · Recording notes into a clip |
| [mixing-and-routing.md](docs/architecture/mixing-and-routing.md) | Effects on tracks (the insert graph) · Stereo · Return tracks and sends · The master bus · Mixer (mute and solo rules) · Track audio |
| [tracks-and-groups.md](docs/architecture/tracks-and-groups.md) | Tracks and groups · Group buses · The Tracks tree |
| [clips-and-arrangement.md](docs/architecture/clips-and-arrangement.md) | Editing clips (piano roll) · Groove · Audio clips · The arrangement |
| [samples-and-wave-editor.md](docs/architecture/samples-and-wave-editor.md) | Samples · The sample editor (wave editor) |
| [workbench.md](docs/architecture/workbench.md) | Layout and navigation · Actions and context menus · Commands and keys · Drag and drop |
| [persistence.md](docs/architecture/persistence.md) | Undo / redo · Saving, loading, import/export · Signature canonicalization and the v9 transition |
| [audio-export.md](docs/architecture/audio-export.md) | Exporting audio (the offline bounce) |
| [library-and-presets.md](docs/architecture/library-and-presets.md) | Snapshots, asset revisions and presets · Personal library catalog · Library bundle exchange |
| [example-projects.md](docs/architecture/example-projects.md) | Example projects (`core/examples`) |

Former sections that moved out of architecture:

| Section | Now in |
|---|---|
| Verification | [docs/dev/verification.md](docs/dev/verification.md) |
| Conventions | [docs/dev/conventions.md](docs/dev/conventions.md) |
| Common changes | [docs/dev/common-changes.md](docs/dev/common-changes.md) |
| Known POC limits | [docs/reference/limits.md](docs/reference/limits.md) |
| Natural next steps | [docs/BACKLOG.md](docs/BACKLOG.md) |

When a change ships, update the subsystem file it belongs to, in the present tense, without dates or slice and
round numbers. The reasons go in [`docs/decisions/`](docs/decisions/README.md); see
[docs/dev/doc-workflow.md](docs/dev/doc-workflow.md).
