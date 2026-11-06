# Documentation

Each question has one home. If you are new, read [STATUS.md](STATUS.md), then
[architecture/overview.md](architecture/overview.md), then [dev/setup.md](dev/setup.md).

```
docs/
  STATUS.md        where the project stands: what exists, now and next, accepted limits, what isn't verified
  BACKLOG.md       open work only, each item with an ID
  IDEAS.md         directions and a pick list of nodes and controls; nothing decided
  guide/           for people using the app: the tour, the examples
  architecture/    how it works now, one file per subsystem (the index is ../ARCHITECTURE.md)
  reference/       versions and formats, the .sfxlib format, limits, baselines
  dev/             setup, verification, conventions, common changes, gotchas, how these docs are kept
  decisions/       why things are the way they are, one row per decision with its source; adr/ for the rules
  active/          specs and plans in flight
  archive/         finished plans, handoffs, reviews, assessments and reports, frozen with a status header
  measurements/    raw evidence from measurement campaigns (logs, traces, JSON)
  browser-checks/  the legacy browser scripts not yet migrated to Playwright specs
```

| I want to… | Go to |
|---|---|
| Know what is done and what is next | [STATUS.md](STATUS.md) |
| Pick up work | [BACKLOG.md](BACKLOG.md), then the plan in [active/](active/) if there is one |
| Understand a subsystem | [ARCHITECTURE.md](../ARCHITECTURE.md) → [architecture/](architecture/) |
| Make a common change (node, command, key, view, project field, example) | [dev/common-changes.md](dev/common-changes.md) |
| Run, test or deploy | [dev/setup.md](dev/setup.md), [dev/verification.md](dev/verification.md) |
| Avoid known traps | [dev/gotchas.md](dev/gotchas.md) |
| Find out why something was done this way | [decisions/](decisions/README.md) |
| Look up a version, storage key or size limit | [reference/formats-and-versions.md](reference/formats-and-versions.md) |
| Compare performance | [reference/baselines.md](reference/baselines.md) |
| Plan a new round, or land one | [dev/doc-workflow.md](dev/doc-workflow.md) |
| Read the history | [archive/](archive/): [the UI redesign rounds](archive/ui-redesign/README.md), [performance and library](archive/2026-10-perf-library/), [the library UX round](archive/library-ux/SPEC-library-ux.md), [handoffs](archive/handoffs/) |

The rules that keep this in order (front matter, what moves where when a round lands, the link check) are in
[dev/doc-workflow.md](dev/doc-workflow.md).
