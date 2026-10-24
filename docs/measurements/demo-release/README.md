# Demo release candidate — 2026-10-24

Scope: finish the performance/library iteration as an experimental demo. This is the user's accepted disposition
of the earlier strict performance hold, not a new performance baseline or a claim that F1's original gate passed.

Implemented:

- CR1: preserve effective overrides before a late automation curve begins within a planned audio horizon.
- CR2: latch audio startup/resume/processor failure, show persistent save/export-and-reload guidance, avoid unhandled
  startup rejections and further queued commands. Editing and project export remain usable.
- F5/R3: locale-independent UTF-16 signatures, project v9 / catalog v2 / bundle v2 boundaries, bounded legacy
  conversion, strict portable guards, atomic catalog backup/rewrite, and raw browser-project backup before overwrite.

Accepted limits: the retained 3.265 ms first callback exceeds its 2.667 ms budget; one-track no-lane overhead was
+27/+30% (roughly 0.9–1 ms per rendered audio second) in the previous controlled runs. All original traces and failures
remain under [f1-fix](../f1-fix/README.md). No C6 campaign, callback benchmark, DSP suspension change, tolerance relaxation,
new feature, or deployment-policy change is included. Physical MIDI and broad browser/device qualification are deferred.

## Verification

- Unit/architecture suite: **1,783 passed** in 138 files (`unit-final.log`).
- Typecheck + production build: **passed** (`build-final.log`).
- Production Chromium: **13 real-output audio checks passed** in the combined run (`browser-initial.log`).
  The new recovery smoke test passed after correcting its test assertion (`startup-final.log`).
  **22 smoke checks passed** in the final full rerun, including the corrected conditional alert layout (`smoke-final.log`).
- Full example walkthrough: **all 8 Low Light + all 6 Glass Rain scenes passed** (`arrangements.json`),
  each for a complete longest pattern plus quantization margin, with advancing transport, audible meter output
  and no page/console errors or failure alerts. Final workspace screenshots were visually inspected.

The `candidate-source/manifest.json` source/build hashes identify the working-tree candidate; HEAD alone does not.
Every captured source/CSS/build/walkthrough hash was rechecked after verification. The source archive includes new
files and CSS; `demo-arrangements.mjs` alongside it preserves the walkthrough runner.
The retained browser logs include the failed test attempt and corrected rerun. Browser verification uses the unchanged production
capture tolerances, finite-window checks and readiness guards. A separate UI walkthrough plays every scene of both
examples for at least its longest pattern plus a quantization margin; its meter/status results are not a listening
assessment, finite-output proof, callback measurement or underrun guarantee.

The first full unit run found test doubles missing the new failure subscription and old version assertions;
these were corrected. The first browser launch was sandbox-blocked at the local preview port (EPERM); verification
was rerun outside the sandbox. The first new recovery browser test read the name from the wrong envelope field
and dereferenced null before debounced autosave; correcting it to poll the optional `project.name` fixed the test.
Static review then caught an unconditional extra workspace grid row introduced by the alert; it is now conditional
on a visible alert. The partial first arrangement walkthrough was stopped before completing Glass Rain and restarted
on the final build. The rebuilt worklet is byte-identical to the one that passed all 13 audio checks.
No production test threshold was weakened.

## Compatibility and recovery

Existing committed project fixtures, package round trips, nested sample presets, locale-dependent legacy signatures,
portable lane insertion, strict bundle validation, local trash/retained records and transaction rollback are covered.
The repository contains compatibility fixtures; actual user browser data and external exports were not inventoried.

The original browser project is retained at localStorage `sfxlab:pre-signature-v9` before its first rewrite; subsequent
saves keep that backup. The old local catalog is retained in IndexedDB `sfxlab`, store `catalog`, key
`pre-signature-v2`, in the same transaction that publishes v2 to `current`. Sample bytes stay in their existing store.
Migration failure retains the original. Source `.sfxlab` / `.sfxlib` files are read-only during import.

For rollback, export current work first and close all other app tabs. Preserve/export the raw backup records and
sample bytes before any recovery action. Use the old compatible project export with the previous app. For a local
catalog rollback, restore `pre-signature-v2` to `current` in the catalog store using a recovery session with application
code stopped, then open the previous app. Do not delete the database or clear site storage. New v9/v2 files are not
readable by the previous release; code rollback alone does not roll back data. Browser backups are recovery aids,
not durable external backups. Unsupported/ambiguous legacy signatures require recovery/re-export through the old app.

## Publication

The candidate is committed locally with its verification evidence. Identify/tag the reviewed commit and publish through
the existing main workflow. Main pushes deploy automatically. This record does not claim a deployed release.
A human listening pass is still useful before demonstrating music; no physical MIDI or subjective audio-quality
assessment is claimed by automation.
