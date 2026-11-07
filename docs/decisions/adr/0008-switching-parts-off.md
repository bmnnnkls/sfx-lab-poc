---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0008: Switching parts off: off, bypass, dormancy, selectors, sleep

## Context

* **Every node of a stage runs every block,** whatever its output feeds. A gain at 0 still runs everything upstream.
* **Bypass is structural.** It restarts the graph, and presets "never replace graphs"
  ([library and presets](../../architecture/library-and-presets.md)).
* **A flagship with switchable engines** (three slots, each VA, wavetable, FM or resonator) would run all of them in
  every voice, and a preset couldn't switch any of them off.
* **What others do** (research, 2026-11-06):
  * **Routers don't save CPU.** Max's `gate~` and `selector~`, Faust's `select2` and SuperCollider's `Select.ar` keep
    every input computing; Faust documents that "all input signals are always computed".
  * **Only real mutes, pauses or plan-time skipping save CPU.** Examples: Max `mute~` and `poly~ mute` (per voice), Pd
    `switch~`, SuperCollider `pause`, Faust's experimental `ondemand`, and VCV's bypass.
  * **Off and bypass are different.** Max, Pd and Faust "off" outputs zeros. VCV and VST3 "bypass" passes input to
    output along routes **the module declares**. VCV warns never to route unrelated signals (a pitch input to an
    audio output).
  * **State.** Vital keeps effects running at mix 0 on purpose, so state isn't lost. Pd and SuperCollider freeze
    state while off.
  * **Runtime sleep.** CLAP (`CLAP_PROCESS_SLEEP` with a declared tail) and VST3 (silence flags, generators flagged)
    sleep a node when its input is silent and its declared tail has elapsed. Generators never sleep, and wake-up is
    at the next block with signal or an event.
  * **Clicks.** Max's `ramptime`, Ableton's chain-select fade ranges and SuperCollider's warning that toggling a
    running node clicks all point the same way: fade on every switch.
  * **UX.** A header power button per module is the norm. Bitwig separates *off* (keeps state, cheap to restart) from
    *deactivate* (frees resources). Users complain when they can't tell whether a disabled module saves CPU.

## Decision

### One switch per node, with a socket

1. **`active`** is a parameter on every node and every module use: boolean, default on.
   * Like every parameter it has a **socket**, so a toggle, a macro, a gate, a logic node or a note's velocity can
     drive it.
   * It is read at block edges (rate `structural`, ADR-0005). A wired value of 0.5 or more is active.
   * It is stored in snapshots and presets, and switches at the midpoint of a morph.
2. **`whenInactive`** is a setting, not modulated:
   * `off` (the default): the node outputs silence, doesn't run, and freezes its state;
   * `bypass`: the node's declared routes pass input to output (ADR-0005), delayed by its `latencySamples` so parallel
     branches stay aligned, and the node doesn't run.

   Only nodes that declare routes offer `bypass`.

   A tri-state on, off, bypass control in the UI sets both: `active` and, when off, the `whenInactive` choice. A wire
   only moves `active`. Today's structural `PatchNode.bypassed` migrates to `active = 0` with `whenInactive = bypass`
   (ADR-0002).
3. **Module uses switch like nodes.** See "Modules and sub-modules" below.

### No clicks, no stale state

4. **Fades.** Every change of `active` crossfades over 5 ms (a node may declare 0 to 20 ms). The node stops computing
   only after the fade.
5. **Waking.** A node that wakes after being inactive longer than its `tailSeconds` calls `reset()` first, so it never
   replays stale audio. Otherwise it resumes where it froze. A node may declare `wake: 'reset'` to always reset.

### The engine skips what isn't needed, in both directions

6. **Backward dormancy: nothing active listens.** A node is dormant when **all** its consumers are inactive (off, or
   bypassed around it) or dormant, and it has no `sideEffects` (indicators, sends, taps, *Track audio* sources,
   feedback sends). A modulation route counts as a consumer.
7. **Forward dormancy: nothing arrives.** A node is dormant when every input is fed only by inactive or dormant nodes
   (or a routing node's unselected output), it is not a `generator`, and its tail has elapsed since its input went
   silent. A filter after a switched-off oscillator therefore stops too.
8. **Runtime sleep: silence arrives.** In shared and insert stages, a node that is not a generator, has a finite tail,
   and has had silent input (below −100 dBFS) for longer than its tail sleeps until a block whose input isn't silent.
   * Silence propagates as a flag on buffers, so downstream nodes don't scan.
   * Never: generators, infinite tails (feedback loops), `sideEffects`, or nodes whose parameters a running source
     modulates.
9. **Dormancy is computed per plan and per voice.**
   * The plan (ADR-0005, ADR-0010) holds a skip mask per stage, recomputed when an `active` value or a routing node's
     choice changes. That is a re-plan over the existing instances, never a rebuild.
   * **Each voice has its own mask.** Values in the voice stage (a selector driven by velocity, note number, the
     per-voice random or a per-voice envelope) switch branches **per voice**: velocity layers, key splits inside one
     instrument.
   * A voice's mask is recomputed at note-on and at block edges where one of its routing values changed. That is a
     bit-mask walk over the stage's nodes, a few microseconds.

### Routing nodes express the choice; the engine does the rest

10. **New nodes** (sound category *Routing*):

    | Node | What it does | Dormant when |
    |---|---|---|
    | **Audio selector** | N inputs → 1, by index, with a crossfade time | Branches that feed only unselected inputs |
    | **Audio router** | 1 input → one of N outputs, by index, with a crossfade | Branches fed only from unselected outputs (forward) |
    | **Crossfader** | 2 inputs → 1 by position | The other branch, at either end |
    | **Audio switch** | 1 → 1, on or off with a fade | Its upstream when off (and its downstream, forward) |

    Their index or position is block-rate; it can be bound, automated, modulated, or set per voice. If one is
    modulated faster than every 50 ms, dormancy is suspended for that node and all its branches run, so CPU doesn't
    depend on the modulation phase.

    Raw wiring alone never switches anything off; the routing nodes are how a patch says which part is unused.

### Modules and sub-modules

Modules are the building blocks of the flagship (flagship report, L2–L4): engine slots, filter sections, effect lanes.
Switching them must work exactly like switching a node.

11. **Every module use has `active` (with a socket) and `whenInactive`**, stored per use like its knob values, and
    included in snapshots, presets and morphs. They are per use, not per definition, so two uses of one module switch
    independently.
12. **Off.** Everything inside the use is inactive, at any depth: a node runs only if it and every module use around
    it are active. An explicit *off* overrides `sideEffects`, so an indicator inside an off module goes dark rather
    than keeping it awake.
13. **Bypass routes belong to the definition.**
    * A module definition may declare bypass routes, pairs of an input port and an output port of the same kind
      (audio to audio, notes to notes), in its *Ports & knobs* editor. VCV's rule applies: route only what the module
      processes, never unrelated signals.
    * A module with exactly one audio input and one audio output (or one notes input and one notes output) gets that
      route by default.
    * Without routes, a use offers only *off*.
14. **Outputs of an inactive use that carry no bypass route:**
    * audio outputs are silent;
    * modulation outputs feeding **routes** output 0, so the target falls back to its base (ADR-0004 adds nothing);
    * outputs feeding a **binding** hold their last value, so a parameter never jumps because its source was switched
      off.
15. **Bypass latency.** The compiler computes the latency along the inner path from each routed input to its output
    (sum of `latencySamples`) and delays the bypass path by the same amount, as for a node.
16. **Flattening keeps the boundaries.**
    * Today `flattenPatch` wires outer connections straight to inner nodes and the module disappears. It will instead
      keep each use as a **scope**: every flattened node records the chain of uses around it, and each module port
      becomes a **boundary point**, a pass-through that costs nothing while the use is active (a buffer alias).
    * The plan switches a boundary point to its bypass source when the use is bypassed, with the same 5 ms fade as a
      node.
    * Dormancy (rules 6–9) sees through scopes: an inactive use makes its whole inside dormant, and an active use
      whose outputs nobody hears is dormant like a node.
17. **Nesting.** Inner uses keep their own switches. An outer *bypass* skips everything inside, whatever the inner
    switches say. An inner switch can be exposed on the outer module like any knob (*Ports & knobs*), so an outer
    panel can switch an inner block.
18. **Note modules** (note-graph domain) switch the same way. On *off*, the notes the module generated get their
    note-offs, through the existing scoped cancel, so nothing hangs. On *bypass*, notes pass along the route, and
    notes generated inside before the switch still get their note-offs.
19. **In the patcher.**
    * A module use's card has the same power control as a node.
    * Inside the module editor, a banner shows when the use being edited is off or bypassed.
    * The module editor shows the bypass routes and their latency.

### In the patcher

20. **On the node.**
    * The header has a **power** control: on, off, or bypass where supported. It is shown on sound nodes and module
      uses, and hidden on controls and math.
    * Inactive nodes are greyed. Dormant nodes, idle only because of their neighbours, are hatched, with a tooltip
      naming the cause.
    * Sleeping effects show a small moon.
    * A routing node shows its current choice on its card.
21. **CPU.** A track's CPU share is shown later (EG27's harness, live), so users can see that switching things off
    helps.

## Options considered

* **Detect silence at runtime for everything.** Unreliable for generators (a silent input doesn't mean silent output).
  Kept only for effects with declared tails, as CLAP and VST3 do.
* **Routers without dormancy** (Max, Faust, SuperCollider). They save no CPU.
* **Presets that change structure.** That breaks the library's model of preset against revision compatibility.
* **Engine-only skipping, no routing nodes.** The engine can skip what nothing hears, but it can't know which of two
  branches the user means to use.
* **One `active` switch with a socket, `whenInactive` off or bypass, dormancy backward and forward and per voice,
  routing nodes, and declared-tail sleep (chosen).**

## Consequences

* The flagship can be one instrument with switchable engines, and its presets choose engines by value.
* Idle returns and silent insert chains stop costing CPU (part of BACKLOG P2). Muted tracks remain P2's own policy
  question.
* Module model additions: bypass routes on `ModuleDefinition`; `active` and `whenInactive` per use; scopes and
  boundary points in `flattenPatch`.
* Node contract additions (ADR-0005): the `active` parameter and the `whenInactive` setting on every node; `bypass`
  routes, `tailSeconds`, `generator`, `sideEffects`, optional `fadeMs` and `wake`.
* **Tests:**
  * a disabled branch costs 0 µs (harness);
  * switching on, off and bypass is click-free (measured discontinuity);
  * a reverb sleeps after its tail and wakes on input without a click;
  * a selector's unselected branches are dormant, and a router's unselected outputs downstream;
  * velocity layers switch per voice with no click, and two voices on different layers each run only their own;
  * a bypassed module with a delay inside stays aligned with a parallel dry path;
  * an off module's binding sources hold their value, and its route sources fall to 0;
  * a note module switched off or bypassed while notes sound leaves none hanging;
  * two uses of one module switch independently, and an outer bypass overrides inner switches;
  * a flattened render of a patch with modules equals the same patch grouped (the existing test), with every use active;
  * bypass with latency stays aligned;
  * an indicator keeps its source awake.

## Related

ADR-0005, ADR-0010, ADR-0015 (no unused parts running); BACKLOG P2; [engine gaps](../../active/REPORT-engine-gaps.md)
(EG14, EG20).
