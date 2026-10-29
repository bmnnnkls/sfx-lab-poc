# Library bundle format v1

`.sfxlib` exchanges personal-library selections. It is distinct from `.sfxlab` project packages and
`.sfxlab.json` project documents. A project does not consult a bundle or the library at playback.
Bundle migrations belong to `storage/library-transfer`, independently of project migrations. The first
version has no legacy migration; unknown/future versions are rejected. Project format is independently v8 (optional delay
divisions). Missing node `division` remains absent in strict legacy v1 records and resolves to numeric beats;
new divisions round-trip without changing the manifest contract.

A bundle is a single-disk ZIP with these entries:

- `manifest.json`: UTF-8 JSON, with the shape below.
- `samples/<sha256>`: original sample bytes, once per lowercase 64-character SHA-256 ID. No extension.

```json
{
  "format": "sfx-lab-library",
  "version": 1,
  "name": "My collection",
  "partial": false,
  "missing": [],
  "catalog": {
    "version": 1,
    "folders": [],
    "items": [],
    "revisions": [],
    "samples": []
  }
}
```

The catalog uses `core/library`'s folder/item/content schema and immutable `core/preset` revisions.
Folder parents and item folders are IDs or null. Asset items reference a revision and current preset
state; first-class preset items also reference their asset item. Revisions embed their nested module
closure and sample IDs. Audio clips/sample items reference sample IDs. MIDI/audio clips carry portable
owner-relative lanes, with graph-signature/node-index guards for graph targets. No trashed records,
unreferenced revisions/sample metadata, external sends/track taps, or unknown record fields are accepted.
Reconstructed graph, preset, clip and sample fields must match validation exactly; imports do not repair
invalid records or silently drop content. Revision signatures are recomputed and checked.

Selections include associated presets, each preset's asset/sibling sounds, immutable revisions, all nested
modules, all sample defaults/overrides/preset choices and ancestor folder paths. Arrays of catalog records
are sorted by ID, object keys are canonical, and ZIP timestamps are fixed for repeatable output from the
same catalog/selection/name. Module IDs and node IDs are private to the immutable payload; project insertion
already remaps the complete nested graph/interface/target closure into fresh project identities.

Export review lists items, folders, revisions/modules, samples, bytes and missing files. Complete export
is the default. Explicit partial export sets `partial: true`, lists every absent sample hash in `missing`,
and uses a `-partial.sfxlib` filename. The missing list must match actual absent files exactly. A partial
bundle can be inspected but cannot be published into the library in v1; restore bytes and export a complete
bundle. Bad hashes or sizes always fail, including partial export.

Import stages all data without storage changes or audio decoding, then shows counts, expanded bytes,
logical ID conflicts and missing files. Confirmation always creates a fresh root folder named after the
bundle; existing equal names remain separate. All folder/item/revision/state IDs are refreshed consistently,
preserving hierarchy and preset associations. Repeating an import deliberately creates another independent
copy. Existing content-hash blobs are compared byte for byte in the same read/write transaction: identical
bytes are retained, different bytes abort. Compatible metadata retains existing local display names;
conflicting byte counts/decoded properties fail. No automatic origin/revision update reconciliation occurs.

Metadata and new blobs publish in one IndexedDB transaction, against the latest catalog snapshot. Success
means transaction completion. Validation, logical-capacity, conflicting-byte, quota and abort failures leave
the previous catalog and existing blobs intact. The storage-less fallback shares one in-memory blob map
between sample and catalog adapters. Trash retains bytes conservatively; bundle import adds no cleanup.

## Budgets and archive checks

| Resource | Limit |
|---|---:|
| Compressed file (checked before browser file allocation) | 128 MiB |
| Total declared/actual expanded bytes | 256 MiB |
| ZIP entries, including manifest | 4097 |
| One sample entry | 64 MiB (32 MiB before round 11b) |
| Manifest bytes before JSON parsing | 8 MiB |
| Folders / items / revisions / sample records per bundle | 1024 / 4096 / 4096 / 4096 |
| Object/array containers / visited values | 100,000 / 300,000 |
| Object depth / string length / identity length | 64 / 1 Mi characters / 256 characters |
| Modules per revision / nodes per graph / connections per graph | 128 / 200 / 40,000 |
| Module depth / expanded node visits per revision | 16 / 10,000 |

The sample cap matches the project package's 64 MB entry cap, so a 120 s stereo sample an edit wrote (32-bit float
WAV, 46 MB) fits. Builds before round 11b refuse a bundle with a sample over 32 MiB as over the entry limit; nothing
else in the format changed, so the bundle version stays.

Existing project record bounds also apply per payload/state/clip: 256 sample dependencies per revision,
64 module ports/knobs, 4096 preset values/bindings, 32-step target paths, 64 automation lanes,
2048 points per lane and 5000 notes per clip. Destination folder/item limits include existing/trash records
and the new root. Revisions and sample metadata must be referenced, preventing metadata-only imports
from accumulating orphan payloads.

The strict ZIP reader preflights every central and local header before allocating expanded output. Paths
are ASCII and match only the two forms above. Duplicate/unknown paths, symlinks, encryption, data descriptors,
ZIP64, extras/comments, split disks, mismatched sizes/names/methods, overlaps, gaps, trailing data and invalid
footer/directory bounds are rejected. Stored and DEFLATE entries are supported. Exports use stored entries;
the compressed-file cap therefore limits exported bytes as well.

For DEFLATE, advertised sizes are insufficient protection: `fflate.Inflate` receives at most 1 KiB of compressed
input per push. Each callback checks actual output against the validated declaration before copying into a
bounded destination. The decoder keeps its 32 KiB history and a bounded chunk expansion (DEFLATE's maximum
ratio is approximately 1032:1). Output length and CRC32 are checked; SHA-256 and metadata byte counts are then
verified before any storage operation. No `unzipSync` allocation based solely on an untrusted header is used.
API contracts were checked through Context7's official fflate documentation on 2026-10-18.

Unit tests cover round trips, associations and nested module/sample closure, duplicate/conflicting imports,
independent project reload/packages, partial/missing/hash/version failures, cycles, unsafe paths, forged
size declarations, resource budgets and real IndexedDB quota/abort/conflicting-byte rollback. The production
browser check covers staging/cancel, repeated imports, folder export, fresh-context import, reload and project
package independence. The existing audio checks retain real-worklet/offline comparisons and finite-window gates.
