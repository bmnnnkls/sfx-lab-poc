# Formats and versions

Every versioned thing SFX Lab writes, its current version, where the constant lives and what each bump added. When a
version changes, update this table in the same commit. How saving and migrations work is in
[architecture/persistence.md](../architecture/persistence.md).

## Current versions

| What | Version | Constant | Where it's kept |
|---|---:|---|---|
| Project file (`.sfxlab.json`, and the project inside a `.sfxlab` package) | **12** | `CURRENT_VERSION` in `core/persistence/format.ts` | `localStorage` `sfxlab:project`, export files |
| Library bundle manifest (`.sfxlib`) | **2** | `LIBRARY_BUNDLE_VERSION` in `core/library/bundle.ts` | export files ([format](library-bundle.md)) |
| Library catalog | **2** | `LIBRARY_CATALOG_VERSION` in `core/library/types.ts` | IndexedDB, and inside bundles |
| Library IndexedDB database | **3** | `LIBRARY_DATABASE_VERSION` in `storage/library-database.ts` | IndexedDB (samples, catalog, edit log) |
| Workbench layout | **2** | `LAYOUT_VERSION` in `ui/layout/layout-storage.ts` | `localStorage` `sfxlab:layout`, `sfxlab:layouts` |
| Keybinding overrides | **1** | in `ui/commands/` | `localStorage` `sfxlab:keybindings` |

Older application builds reject files whose version is newer than theirs. A project file is never written in an
older version.

## Project format history

`MIGRATIONS[n]` in `core/persistence/migrations.ts` upgrades a payload from version n to n + 1. Each version has a
committed fixture in `core/persistence/fixtures/`.

| Version | Added | Fixture |
|---:|---|---|
| 1 | First versioned format | `v1-minimal` |
| 2 | Per-instance control values | `v2-instance-values` |
| 3 | MIDI mappings | `v3-midi-mappings` |
| 4 | Clip automation | `v4-automation` |
| 5 | Return and master automation slots | `v5-automation-slots` |
| 6 | Snapshots and presets | `v6-presets` |
| 7 | Library origins | `v7-library`; `v7-delay-timing` is a v7 file read before divisions existed |
| 8 | Optional delay `division` | `v8-delay-timing` |
| 9 | Locale-independent structural signatures (UTF-16 code-unit order) | (signature migration tests) |
| 10 | Track groups, hidden tracks; later, without a bump: group buses, group mute and solo, pins | `v10-track-groups`, `v10-group-buses`, `v10-pinned-panels` |
| 11 | A sample's `origin`, `markers` and `regions` (stereo samples, wave editor) | `v11-sample-markers` |
| 12 | A sample's `loop` (what a sampler in *loop* mode repeats) and `lineage` (the original's facts and each in-place edit's position map, for *Revert to original*) | `v12-sample-lineage` |

Fields added without a bump (as in v10) are dropped silently by builds that predate them. Use that only when the
file is never worse for losing the field; otherwise bump.

## Backups written during migrations

| Key | Written when | Contains |
|---|---|---|
| `localStorage` `sfxlab:pre-signature-v9` | The first save over a project older than v9 | The original serialized envelope |
| `localStorage` `sfxlab:backup` | Replacing the project (import, new, example) | The previous project, for *File → Restore previous* |
| IndexedDB `catalog/pre-signature-v2` | Converting a v1 library catalog | The original catalog |

Do not clear site storage to recover from a bad upgrade: it deletes the sample bytes too. Rollback steps are in
[architecture/persistence.md](../architecture/persistence.md#signature-canonicalization-and-the-v9-transition).

## Other `localStorage` keys

These are per-browser preferences, not versioned. Each read must tolerate a missing or malformed value.

`sfxlab:main-view`, `sfxlab:editor-height`, `sfxlab:arrangement-zoom`, `sfxlab:welcomed`, `sfxlab:groove`,
`sfxlab:roll-*` (zoom, velocity, grid, follow, audition), `sfxlab:wave-*` (ruler, ruler-tempo, loop, fade-curve,
crossfade, edit-settings, edit-copies, snap, second-pane, lanes, spectrum), `sfxlab:corrupt` (a project that failed to load, kept for recovery),
`sfxlab:probe` (storage availability check).

## Size limits

| Limit | Value | Where |
|---|---|---|
| Imported sample | 120 s / 32 MB | sample import |
| Sample entry in a `.sfxlab` package or `.sfxlib` bundle | 64 MiB | package and bundle readers |
| Bundle file / expanded | 128 MiB / 256 MiB | [library-bundle.md](library-bundle.md#budgets-and-archive-checks) |
| Decoded audio kept for undo | 128 MB on the main thread, 128 MB in the engine | `app/sample-budgets.ts` |
| Tracks, groups, pins, scenes, samples, modules, notes per clip | see `LIMITS` | `core/persistence/format.ts` |
