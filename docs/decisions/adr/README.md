# Architecture decision records

An ADR records one decision that shapes the engine, the formats or the conventions every node, module and preset
follows. It gives the context, the options, the decision and its consequences. ADRs were introduced for the flagship
synth's Phase 0 ([report](../../active/REPORT-flagship-synth.md#7-phased-plan)) and the engine PI
([engine gaps](../../active/REPORT-engine-gaps.md)), per [ADR-0001](0001-record-architecture-decisions.md).

The [decisions table](../README.md) keeps one row per smaller decision. An ADR is for a decision that needs more than a
row, or that later work must follow as a rule. When an ADR is accepted, add a row to the table that links to it.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | proposed |
| [0002](0002-breaking-engine-changes.md) | Breaking engine changes, migrations and sound compatibility | proposed |
| [0003](0003-signal-conventions.md) | Signal conventions: pitch, ranges, gates, port order | proposed |
| [0004](0004-modulation-model.md) | Modulation model: bindings and additive modulation routes | proposed |
| [0005](0005-node-contract.md) | The node contract (Node API v2) | proposed |
| [0006](0006-channels-and-layouts.md) | Channels: N channels with a layout; instruments mono or stereo | proposed |
| [0007](0007-voice-architecture.md) | Voice architecture: modes, unison, glide, stealing, per-voice facts | proposed |
| [0008](0008-switching-parts-off.md) | Switching parts off: off, bypass, dormancy, selectors, sleep | proposed |
| [0009](0009-feedback-policy.md) | Feedback: inside primitives, or through an explicit block delay | proposed |
| [0010](0010-graph-swaps.md) | Graph swaps: built off the critical path, installed without cutting notes | proposed |
| [0011](0011-anti-aliasing.md) | Anti-aliasing and oversampling policy | proposed |
| [0012](0012-determinism.md) | Determinism: seeded sources, reproducible renders | proposed |
| [0013](0013-runtime-language.md) | Runtime: TypeScript first, WASM for measured hot kernels | proposed |
| [0014](0014-node-evolution.md) | Node evolution: upgrade in place, migrate, no legacy twins | proposed |
| [0015](0015-macros-and-presets.md) | Macro and Factory preset conventions | proposed |

## Statuses

`proposed` (a draft for review), `accepted`, `rejected`, `superseded` (with `superseded_by`), and `deprecated`. A
decision that changes is a new ADR that supersedes the old one. Accepted ADRs are not rewritten, except to fix typos
and links.

## Template

```markdown
---
status: proposed
date: YYYY-MM-DD
deciders: (who signs off)
supersedes: (optional, ADR number)
superseded_by: (optional)
---
# ADR-NNNN: Title as a decision

## Context
What forces the decision: facts with links to code and docs, constraints, what goes wrong without it.

## Decision
What we will do, stated as rules. Numbers and names where they matter.

## Options considered
Each option, in a line or two, with why it was or wasn't chosen.

## Consequences
What becomes easier, what becomes harder, what must be migrated, what to verify.

## Related
Other ADRs, specs, backlog items.
```
