---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0001: Record architecture decisions

## Context

* Decisions live as rows in [decisions/README.md](../README.md), each pointing at the spec or plan that holds the
  reasoning. That works for decisions scoped to one round.
* The flagship synth and the engine PI need **rules** that every later node, module and preset follows. These are
  long-lived, cross-cutting and argued once: signal units, the modulation model, the node contract.
* A row can't carry them. A spec gets archived with its round, and its decisions sink with it.
* The decisions README already allows "a separate file when a decision needs more than a row".

## Decision

1. Cross-cutting engine, format and convention decisions are recorded as ADRs in `docs/decisions/adr/`, numbered
   `NNNN-kebab-title.md`, using the template in [the ADR index](README.md).
2. An ADR starts as `proposed`. It becomes `accepted` when the project owner signs it off. Implementation must not
   contradict an accepted ADR. A change is a new ADR that supersedes the old one.
3. Each accepted ADR gets a row in the decisions table that links to it. The table stays the one list of everything
   decided.
4. A spec or plan cites the ADRs it relies on rather than restating them. It notes any deviation as a question for a
   new ADR.
5. `architecture/` describes what the code does. ADRs say why, and what must stay true.

## Options considered

* **Rows only.** These decisions need context and alternatives, and later specs need to cite them as rules.
* **Put the rules in the specs.** They get archived with the round and are hard to find afterwards.
* **ADRs beside the table (chosen).** Cheap, and fits the existing "a file when a row is not enough" rule.

## Consequences

* Phase 0 of the flagship becomes reviewing ADR-0002 to ADR-0015.
* The doc link check covers the new folder like any other.
* [dev/doc-workflow.md](../../dev/doc-workflow.md) should gain a line on when to write an ADR. Do that once this ADR is accepted.

## Related

[Decisions table](../README.md), [flagship report](../../active/REPORT-flagship-synth.md),
[engine gaps report](../../active/REPORT-engine-gaps.md).
