# How the docs are kept

The rules that keep [the docs](../README.md) in order. Each question has one home:

| Question | The one place that answers it |
|---|---|
| How does X work now? | [`architecture/`](../architecture/), one file per subsystem |
| Where do we stand, and what's next? | [STATUS.md](../STATUS.md) |
| What is open? | [BACKLOG.md](../BACKLOG.md) |
| What could we do some day? | [IDEAS.md](../IDEAS.md) |
| Why is it like this? | [`decisions/`](../decisions/README.md) |
| What is version N, and what's the limit on Y? | [`reference/`](../reference/) |
| How do I build, test or change things? | [`dev/`](./) |
| What is being planned right now? | [`active/`](../active/) |
| What was planned, reviewed or measured before? | [`archive/`](../archive/) and [`measurements/`](../measurements/README.md) |

No other document has a "next steps", "open tasks" or "status" section.

## Front matter

Every file in `active/` and `archive/` starts with YAML front matter:

```yaml
---
status: active | done | partly-done | superseded | historical
date: 2026-10-29             # the last date the status changed
shipped_in: architecture/workbench.md   # optional, relative to docs/
superseded_by: PLAN-fix-F1.md           # optional, relative to the file
note: "One line on what is left or why it was set aside."
---
```

`architecture/`, `dev/` and `reference/` describe the present, so their files carry no front matter or dates. They are
true or they are bugs.

## The life of a round (or any planned piece of work)

1. **Spec, if the work needs product decisions**: `active/SPEC-<topic>.md`. Its decisions table is signed off before
   planning.
2. **Plan**: `active/PLAN-<round>-<topic>.md`, with the sections the redesign rounds use: Goal, Inventory, Design,
   Steps, Behavior changes, Verification, Decisions to sign off, and, filled in while building, **Changes made while
   implementing**.
3. **While building**, record surprises in "Changes made while implementing", step by step, as now.
4. **When it lands**, before the plan moves:
   1. Describe the shipped behavior in the right `architecture/` file, in the present tense, without dates or
      round numbers. Remove anything the round made untrue.
   2. **Sort the "Changes made while implementing" notes.** Each note goes to one place:

      | Kind of note | Goes to |
      |---|---|
      | An invariant or contract the code keeps | the subsystem's `architecture/` file |
      | A choice with a reason (a signed-off decision, or one made while building) | a row in [decisions/README.md](../decisions/README.md) |
      | A trap the next person would fall into | [dev/gotchas.md](gotchas.md) |
      | A measurement worth comparing against later | [reference/baselines.md](../reference/baselines.md), with date, commit, machine and method |
      | A version, constant or limit, and where it lives | [reference/formats-and-versions.md](../reference/formats-and-versions.md) |
      | A test technique | [dev/verification.md](verification.md) |
      | Something not done, not checked, or deferred | an item in [BACKLOG.md](../BACKLOG.md) |
      | Narration, file moves, helper names | nowhere: git has it |

   3. Add a line to [STATUS.md](../STATUS.md), and delete the backlog items the work closed.
   4. Add front matter (`status: done`, `shipped_in`) and `git mv` the plan, and its spec once every part is done, into
      `archive/<project>/`.
5. **Run the link check** (below) before committing.

Reviews, assessments and reports follow the same path. Their findings go to the backlog, accepted limits go to
STATUS, and the document goes to `archive/`.

## Measurements

Raw logs, traces and JSON go under [`measurements/<campaign>/`](../measurements/README.md) with a README that states the
question, the method, the commit and the result. Summaries worth keeping go to `reference/baselines.md`. Commit the
script that produced the numbers.

## Checking links

Run the checker from the repository root before committing doc changes:

```bash
python3 scripts/check-doc-links.py
```

It checks that every relative link in `docs/`, `README.md` and `ARCHITECTURE.md` points at a file that exists, and that
every `#anchor` matches a heading in that file.
