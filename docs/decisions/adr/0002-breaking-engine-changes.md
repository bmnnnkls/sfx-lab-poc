---
status: proposed
date: 2026-11-06
deciders: project owner
supersedes: "decision 5 (old projects stay bit for bit), for the engine PI only"
---
# ADR-0002: Breaking engine changes, migrations and sound compatibility

## Context

* Until now, old projects were promised to **sound bit for bit the same**:
  * [decision 5](../README.md) states it;
  * `core/engine/old-projects.test.ts` holds sha256 hashes of old projects' bounces;
  * new behaviour had to hide behind defaults that reproduce the old math.
* That promise blocks most of the engine PI. A band-limited oscillator, an SVF in place of the biquad, curved
  envelopes, parameter smoothing and stereo voices all change the samples, even where nobody could hear the
  difference.
* The project owner has accepted breaking changes for this work, "carrying over the example projects if possible
  with reasonable effort".
* The examples and the Factory are built from code (`core/examples`, the patch DSL, `FACTORY_CONTENT`), so they can
  be rebuilt rather than migrated.

## Decision

1. **Structure is preserved; samples may change.** A project from before the PI loads with every track, clip,
   automation lane, preset and module intact, and plays its musical intent. It does not have to produce the same
   samples. The bounce hashes in `old-projects.test.ts` are retired at the PI's format bump. They are replaced by
   *migration tests* (loads without loss, renders finite and audible, structural assertions) and new golden renders
   taken after the PI.
2. **One format bump for the PI** (v16). Rounds 12b and 12c did the same with v13. It has one migration, `MIGRATIONS[15]`,
   and a fixture per kind of rewrite:
   * pitch wires (ADR-0003);
   * bindings and modulation routes (ADR-0004);
   * node parameters remapped (ADR-0014);
   * stereo flags (ADR-0006).
3. **Migrations rewrite to the nearest equivalent sound.** If an exact rewrite exists (a socket wire to a binding),
   use it. If only an approximation exists (a linear envelope to a curved one with curve 0, a biquad mode to the SVF
   mode), approximate and record it in the migration's notes. Never drop a node or a wire silently. If something can't
   be mapped, keep the node, flag it and report it with the loader's existing warnings.
4. **Examples and Factory are rebuilt, not migrated.**
   * Low Light, Glass Rain, the Starter and the Factory starters are rewritten in the DSL against the new conventions.
   * A listening pass compares old and new renders. Both are bounced, and differences beyond "the same sound,
     cleaner" are fixed or noted.
   * The examples' structural tests stay. Their audio assertions are re-baselined.
5. **Presets and the library.**
   * Snapshot and preset values are parameter values; they migrate with the same parameter remaps as graphs.
   * Library catalog items in IndexedDB are graphs, so they go through the same migration on read. The catalog
     version bumps if the stored shape changes.
   * `.sfxlib` bundles from before the PI import through the migration.
6. **No legacy engine path.** The old math is not kept behind flags (see ADR-0014).

## Options considered

* **Keep bit-exactness (status quo).** Every improvement then needs a legacy twin, so the engine grows two of
  everything. Rejected by the project owner.
* **No migration, old projects refused.** Cheap, but loses users' work and the library. Rejected.
* **Structure-preserving migration with re-baselined sound (chosen).**

## Consequences

* The PI can change DSP freely. Any sound regression is caught by listening passes and new golden renders, not hashes.
* Older builds cannot open v16 files (as with every bump). `main` should ship the PI as one release.
* Work: the migration, its fixtures, the rebuilt examples, a listening pass (BACKLOG V-style item), and new
  golden-render tests (IDEAS F8).
* Decision 5's row is marked *superseded by ADR-0002* when this is accepted. Decisions 6 and 43 also assume bit-exact
  playback and need the same marking.

## Related

ADR-0003, ADR-0004, ADR-0006, ADR-0014; [persistence](../../architecture/persistence.md);
[formats and versions](../../reference/formats-and-versions.md).
