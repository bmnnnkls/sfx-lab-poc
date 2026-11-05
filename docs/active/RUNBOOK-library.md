---
status: active
date: 2026-11-04
note: "How the library UX round is built without stopping: order, gates, what needs the user, what doesn't, and where to hand off to a fresh session."
---
# Runbook: building the library UX round

This is the operating manual for [SPEC-library-ux.md](SPEC-library-ux.md) and its seven plans. An implementing session
reads this first, then the plan for its phase, and keeps going until a **stop condition** below is hit or the phase is
done.

## Order

| Phase | Plan | Needs | Session |
|---|---|---|---|
| 1 | [Tree and drag and drop](PLAN-library-1-tree.md) | — | A |
| 2 | [Library menu and dragging in](PLAN-library-2-entry-points.md) | 1 | A, or B if A's context is long |
| 3 | [This project](PLAN-library-3-this-project.md) | 1, 2 | B |
| 4 | [Sounds](PLAN-library-4-sounds.md) | 2 for *Save to library* on a row (can stub it if 4 goes first) | C |
| 5 | [The library link](PLAN-library-5-link.md) | 4 | D |
| 6 | [Factory](PLAN-library-6-factory.md) | 1, 3 (source catalog), 5 (links) | E |
| 7 | [Polish and closing](PLAN-library-7-polish.md) | 1–6 | F |

The phases run in that order, one session at a time, on one branch. The letters are suggested hand-off points:
**start a fresh session at the start of a phase** whenever the current one has grown long. Plans are written to be
read cold. Never hand off mid-step: finish the step's commit first.

## Branch, commits, pushes

* Work on `feat/library-improvements`. One commit per plan step, with the plan's step number in the message, ending
  with the attribution lines the session's system reminder gives.
* **Don't push, open a PR or merge** without the user asking. A phase can finish locally.
* Before step 1 of any phase, re-check that plan's inventory against the branch tip. Where the code has moved (an
  earlier phase renamed something), fix the plan in the same commit as the first step, and note it under "Changes
  made while implementing".

## Gates for every step

| Gate | Command | Where |
|---|---|---|
| Unit and architecture | `npm test` | sandbox |
| Types | `npm run typecheck` | sandbox |
| Production build, warning-free | `npm run build` | sandbox |
| Smoke | `npm run test:smoke` | **outside the sandbox**: it serves on port 4173, which the sandbox refuses |
| Audio (when a plan says so) | `npm run test:audio` | outside the sandbox |

* **To run without a prompt per smoke run**, the user can set `sandbox.network.allowLocalBinding: true` in their
  Claude Code settings. Otherwise each smoke run asks for approval, and an unattended session stops there.
* **Known flaky tests** (backlog V6, V7): `library.smoke.spec.ts`'s isolated-preview case, and `tempo.audio.spec.ts`'s
  ping-pong tail on a busy machine. Re-run once. If it fails twice, run it alone. If it fails alone, that's a real
  failure.
* **After a step that changes a view**, check it in the built-in browser preview (the `dev` launch configuration) at
  the sidebar's 280 px and at a wide size, light and dark, and look at a screenshot. Specs check behavior; this
  checks that it looks right.

## Stop conditions: ask the user

Stop, describe the problem in a few lines, propose an answer, and wait, when:

1. **A signed-off decision turns out wrong or impossible** and the way around it changes what the user sees, a file
   format, storage, or the catalog. (A different internal design for the same behavior is not a stop.)
2. **A format or version change the plans don't name**: project file, catalog, bundle, IndexedDB, layout.
3. **A test would have to be deleted or weakened** for a reason other than "the control it used is gone, and the new
   test covers the same behavior". Rewriting tests onto new labels is normal; dropping a case is a stop.
4. **A real failure in an existing audio or smoke spec** that this round didn't intend, after the flake rule above.
5. **A new runtime dependency**, or an upgrade of one.
6. **The production build warns**, or the main chunk grows by more than 5 kB gzipped in one phase.
7. **Something destructive**: deleting user data paths, rewriting history, force-pushing, or touching `main`.
8. **The session is about to start work outside the round's spec** because it found a bug elsewhere. Note it and
   propose it as its own task; don't fix it inside the round unless it blocks a step.

## Not a stop: decide, record, continue

* Labels and wording within the spec's tone, CSS, spacing, glyphs.
* Internal names, file splits, helper placement, refactors inside files the step touches.
* Small plan corrections where the code differs from the inventory, as long as the behavior is the same.
* Measurements that trip a threshold a plan already decided, such as virtualization at 100 ms or Factory in an idle
  callback at 150 ms. Do what the plan says.
* Extra unit tests.

Record each one under the plan's **Changes made while implementing**, one line per item, as the doc workflow asks.

## The end of a phase

1. All gates green, and the view checked in the browser.
2. **The docs step of the plan**: the architecture files in the present tense, and the plan's notes sorted into
   architecture, decisions, gotchas, baselines, formats or backlog (`dev/doc-workflow.md`).
3. The plan's front matter gets `status: done`, the date and `shipped_in`. The plans stay in `active/` until phase 7
   moves the round to the archive.
4. A short phase report in the session: what shipped, the commits, what was decided along the way, and what's queued
   for the user (below).
5. If the context is long, hand off: start the next phase in a new session with the brief below.

## Hand-off brief (for a fresh session)

> Implement phase *N* of the library UX round on `feat/library-improvements`. Read
> `docs/active/RUNBOOK-library.md`, then `docs/active/PLAN-library-N-….md`, and follow them: one commit per step, gates
> green at each, stop only on the runbook's stop conditions. Phases 1…*N−1* are done (see their "Changes made while
> implementing"). Don't push.

## Queued for the user (never blocking)

Collected here as the phases go, and reported at each phase's end:

* **Listening pass** on the Factory sounds (phase 6).
* **Browsers**: drag and drop and spring-open in Firefox and Safari. The specs run in Chromium only.
* **Physical MIDI** is untouched by this round (backlog V5).
* Any label or wording the session was unsure of, listed with the screen it's on.
* **The transport bar wraps earlier** (phase 2): with the *Library* button its buttons go to a second line below about
  1250 px of window width, instead of about 1175 px.
* **Wording to look at** (phase 3), in the Library's *This project*: the details ("Bass instrument · Instrument ·
  This project", "1 sound" on a track, "16 tracks · 68 clips · no samples. Drag a sound, clip or sample onto a folder to
  save it to the library." on the root), *Show*'s tooltip ("Select it and open its Instrument view"), and the group bus
  row's name ("Drums bus"). A clip row's *Show* is the clip's own *Edit notes*.
* **Listening** (phase 3): copy Low Light's stab onto a new track and play both; the copy's graph is checked by tests,
  not by ear.
* **Wording to look at** (phase 2): the Library menu's disabled reasons ("Select an instrument track", "Sum the group
  to a bus first", "Bass has no note effects") and the drop refusals ("Uses Track audio from Kick", "Uses a Send to
  Echo"), in the transport bar's *Library* menu and on the Library's rows during a drag.

## Decisions made in the plans

All signed off 2026-11-04, phase 1's and phases 2–7's as proposed. The ones most worth remembering:

| Phase | Decision | Proposed |
|---|---|---|
| 2 | Dropping an instrument track on a folder | saves *Instrument + notes* |
| 2 | Saving a project preset on its own | a new library sound from the preset's own revision |
| 3 | Where *This project* sits | first in the tree, collapsed by default |
| 3 | Copying a sound from track to track | allowed, by drag and *Copy to new track* |
| 4 | Recall target in Sounds | always the selection (removes the button-versus-menu exception) |
| 4 | Sounds' tab | follows the visible editor |
| 5 | **Format version for the link** | **no bump** (optional fields, like pins): corrected spec D11 |
| 5 | Link liveness | a stored hash of the inserted graph's signature |
| 6 | Factory content | the plan's table: no ducked effects, no presets yet, 12 clips, 5 starters |
| 6 | Factory loading | a lazy chunk, and an idle callback if over 150 ms |
| 7 | Multi-drag onto the project | refused with several items |
