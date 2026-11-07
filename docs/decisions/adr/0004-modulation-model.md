---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0004: Modulation model: bindings and additive modulation routes

## Context

* Today a wire into a parameter socket **replaces** the parameter. Several wires add up, and "to add on top of a stored
  value use an *Add* node" ([control nodes](../../architecture/control-nodes-and-panels.md)).
* Sockets are read **once per 128-sample block** (`ParamFeed` in `instrument/compile.ts`), so a modulated cutoff or
  level steps every 2.67 ms.
* Only automation curves reach a node per sample. They do it by re-running the whole node once per sample with
  `frames = 1` (`processAutomatedRun`), which also allocates a buffer, a `Map` and closures per call.
* Three nodes have dedicated audio-rate modulation inputs, each in its own unit (oscillator `pitch`, filter `cutoff`,
  gain `cv`).
* Flagships (Serum, Vital, Phase Plant, Bitwig) apply modulation the same way: *source × depth*, added to the knob's
  position on the knob's own scale, clamped, and shown as a ring on the knob. Depth and polarity sit on the route,
  with an optional curve. Our model can't express "the knob, plus an LFO, plus the mod wheel" without three helper
  nodes per parameter, and it can't show it.
* Panels rely on the replace model: a panel knob is a control node wired into a socket. That must keep working.

## Decision

A numeric parameter's value is computed from three parts:

```
value = denorm( clamp01( norm(base) + Σ route.depth × curve(route.source) ) )
```

1. **Base.** The parameter's stored value, or its **binding**. A binding is at most one wire that *sets* the base: a
   panel control, a macro, a module knob, or any signal when replace semantics are wanted. This is today's socket
   behaviour, kept under that name.
2. **Modulation routes.** Any number of wires that *add* to the base. Each has:
   * a `depth` from −1 to 1, in units of the knob's full travel;
   * a curve (linear by default; later exponential, logarithmic, S-curve or stepped);
   * an optional `via`, a second source that scales the depth: the mod wheel scaling vibrato depth, an envelope
     scaling an LFO. This is "modulation of modulation" without extra nodes.

   The source's polarity comes from its port kind (ADR-0003): a unipolar source pushes one way, a bipolar one both.
3. **`norm` and `denorm`** are the parameter's knob mapping (`param-scale.ts`: linear, log, exp). So "+0.25 on cutoff"
   means a quarter of the knob's travel, a fixed interval in octaves, and "+0.25 on pitch fine" means a quarter of its
   range.
4. **Sum, then clamp.** Routes add up in normalized space and are clamped once, to 0..1. The order of routes never
   matters.
5. **Rates** (the mechanics are in ADR-0005):
   * By default the engine evaluates each parameter once per block. It ramps linearly from the previous block's end
     value to the new one, so there is no zipper.
   * Parameters a node declares `audio` rate get a true per-sample buffer: oscillator pitch and phase, amplitude,
     filter cutoff.
   * Automation curves feed the same buffers. `processAutomatedRun` and its per-sample re-runs go away.
6. **Smoothing.**
   * Base changes from the UI, presets, morphs, MIDI CCs and expression ramp over 5 to 20 ms. The default is 10 ms;
     a parameter may declare its own.
   * Switch, selector and enum parameters never ramp. They change at the block edge.
7. **Visibility.** The engine reports, per instrument, the current *effective* value of every modulated parameter of
   the selected track's graph, at status rate. The UI draws rings and mod indicators from it.

### In the patcher

* Wires into a parameter are drawn as **modulation routes** (a depth handle on the wire, and a list in the property
  editor) unless marked as the binding. A control node's or macro's wire defaults to the binding; any other source
  defaults to a route.
* The old dedicated inputs (oscillator `pitch`, filter `cutoff`, gain `cv`) become ordinary audio-rate parameters with
  routes. The gain's `cv` remains as a VCA input: an audio multiplier, not a parameter.

## Options considered

* **A *Mod* node (attenuverter + add) with ramped sockets.** Cheaper, but every modulated parameter costs a node and a
  wire, there is still nothing to show on a knob, and the semantics stay "replace".
* **A separate modulation matrix (Hydrasynth-style slots).** Familiar, but it duplicates the graph and hides routes
  from the patcher.
* **Engine-level routes on the graph's own wires (chosen).** One model for panels, macros, automation and
  modulation, and it can be drawn.

## Consequences

* Node implementations read parameters from per-block values or buffers, not from `setParam` calls inside the block
  (ADR-0005).
* **Migration (ADR-0002):**
  * One wire into a socket becomes its binding. The sound is identical except for the ramp.
  * Several wires become one binding through an inserted *Add* node, as before.
  * Oscillator `pitch` CV wires become pitch routes, depth = *Pitch CV* / range.
  * Filter `cutoff` CV wires become cutoff routes, depth = *CV amt* octaves / the knob's octave span.
* Macros (ADR-0015) are control nodes bound to many parameters through routes, with depth per route.
* Cost: parameter evaluation moves into the engine, about 2 multiply-adds per route per block, plus a 128-sample ramp
  per parameter that changed. That is cheaper than today's per-sample re-run.
* **Work:** a spec with the UI (wire depth handles, rings, the route list) before implementation. The engine half is in
  the PI.

## Related

ADR-0003 (polarity by kind), ADR-0005 (parameter buffers), ADR-0015 (macros); BACKLOG C7 (audio-rate sockets), C11
(control ports on module uses).
