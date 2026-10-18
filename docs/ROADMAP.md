# Roadmap and retained explorations

The [exploration notes](EXPLORATIONS.md) from 2026-10-14 contain longer-term proposals for Rust/WASM,
Pure Data, git-backed projects, collaboration, touch surfaces, visuals and installation hosts. They are
research notes, not implemented features or a replacement for the agreed performance/library sequence.

The MIDI performance/learn, automation, snapshots/presets, folder library, bundle exchange and tempo-polish
sequence is implemented through slice 7. Branch review findings still require independent assessment before a
merge decision; see [TASKS.md](TASKS.md) and [REVIEW-performance-and-library.md](REVIEW-performance-and-library.md).
Platform spikes and licensing decisions can be revisited separately; preserving these notes does not schedule them.

## Claude branch salvage (2026-10-17)

Source: `origin/claude/stoic-cray-8d4r4x`, tip `eaf12cdc4626a002190d212b89023c2e38b46b84`.
The salvage branch starts from `main` at `73d2c52`, independently of the paused performance/library branch.

| Source | Disposition |
| --- | --- |
| `387f5db` math optimization | Retained, including block preparation, unwired pure-node fast path and tests. Original timing figures are historical measurements, not a new benchmark. |
| `f67fd53` tempo/note DSP | Retained runtime nodes, previews/catalog/docs, tests and beat-based example echoes. Legacy browser-script changes omitted. Two-second delay capacity and unsmoothed transitions remain explicit limitations. |
| `eaf12cd` MIDI | Retained only the pure message parser, descriptions and tests; tightened malformed-byte validation. No MIDI browser access, learn UI, node bindings or live-note commands. |
| `e0ffae9` browser checks | Runner omitted: the performance/library branch already supplies portable Playwright verification. Registry-derived expectations remain useful when migrating legacy checks. |
| `8a36da2` through `dd0cc56` explorations/roadmap | Exploration notes preserved; roadmap reconciled with the agreed delivery sequence and actual shipped scope. |

This table records scope at the salvage merge. Subsequent slices 2a/2b implemented held-note ownership, browser
MIDI and learn; slice 7 completed bounded divisions and smooth delay transitions. The limitations in the table
describe the salvaged source, not the current branch.

The omitted MIDI prototype bypasses note graphs and releases by pitch. A review regression reproduced a
live key release stopping an older same-pitch clip voice while leaving its own voice held. Device identity,
sustain, disconnect cleanup and project target-based mappings required the separate implementation now shipped in
slice 2. Reusing the parser does not establish any engine or browser lifecycle contract.

The original remote branch is retained as a reference. Salvaging these pieces does not merge or delete it.
