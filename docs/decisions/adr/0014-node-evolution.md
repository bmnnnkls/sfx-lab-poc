---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0014: Node evolution: upgrade in place, migrate, no legacy twins

## Context

* The flagship report asked whether to upgrade *Oscillator*, *Envelope*, *LFO* and *Filter* in place, or to add new
  nodes beside them (*VA osc*, *SVF*) and keep the old ones for the examples
  ([decision 4 there](../../active/REPORT-flagship-synth.md#8-decisions-to-discuss)).
* With breaking changes accepted (ADR-0002), the old nodes have no reason to stay:
  * two oscillators and two filters in the picker confuse users;
  * twins double the tests;
  * they keep the old units (Hz pitch, scaled CV inputs) alive.
* Saved files store a node's `type` and its params **by id**, and enums **by index** ("append to the mode list").

## Decision

1. **Core sound nodes are upgraded in place and keep their `type`.**

   | Node | Becomes |
   |---|---|
   | `oscillator` | Band-limited VA oscillator (ADR-0011): PWM, sync, `pm` |
   | `filter` | ZDF SVF with drive (ADR-0011), the static shelves and peak kept |
   | `envelope` | Curved DAHDSR with loop and velocity |
   | `lfo` | Adds phase, fade-in, smooth random and retrigger modes |
   | `comb` | Extended Karplus-Strong |
   | `sampler` | Stereo |

   New *kinds* of node get new types: `wavetable`, `ladder`, `fm-op`, `modal`, `chorus`, `phaser`, `waveshaper`,
   `crusher`, and others.
2. **Parameters.**
   * Ids are kept where the meaning is kept.
   * A changed meaning gets a **new id**, and the migration converts the old value (for example a `resonance` Q in
     0.1..20 becomes a `resonance` in 0..1 under a new id `res`).
   * Enum lists may be **reordered and pruned** at the PI bump. The migration maps old indices to new ones.
   * After the PI, the append-only rule applies again.
3. **Every remap has a table** in the migration, and a fixture covering each upgraded node with non-default values.
4. **No legacy flags.** There is no "classic mode" that reproduces the old math (ADR-0002). A deliberately lo-fi
   option is a sound choice, not compatibility.
5. **Deprecations.** A node made redundant (for example the hand-built *Soft clip* module, once *Waveshaper* ships) is
   migrated to its replacement where a mapping exists. It stays loadable but leaves the picker.

## Options considered

* **New nodes beside the old ones.** Safe for old sounds, but it is the twin problem, and it contradicts ADR-0002.
* **New types, old types migrated to them.** Clean names, but it churns every saved file's `type` field for little
  gain.
* **Upgrade in place, with remapped parameters (chosen).**

## Consequences

* One migration table per upgraded node. The ADR-0002 migration tests cover them.
* Docs: [node-docs](../../../src/core/dsp/node-docs.ts) entries are rewritten for the upgraded nodes, and the patcher's
  previews (`ui/patcher/previews/`) are updated (the filter preview keeps its own copy of the mode list).

## Related

ADR-0002, ADR-0003, ADR-0011; the [Effects round 2 spec](../../active/SPEC-effects-round-2.md) (its part 3 becomes
`waveshaper` and `crusher` under these rules).
