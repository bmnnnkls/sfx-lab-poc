---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0005: The node contract (Node API v2)

## Context

Today a node is a `DspNode` with `setParam(id, value)` and
`process(context, inputs, outputs)` ([types.ts](../../../src/core/dsp/types.ts)). Four problems follow from that
shape:

* **Parameters are scalars set between blocks.** That rules out ramps and per-sample modulation, unless the compiler
  re-runs the node one sample at a time (`processAutomatedRun`). ADR-0004 needs parameters as values *or* buffers.
* **Nodes say nothing about cost, latency, tail or reset.**
  * The bounce special-cases delays to know how long a tail rings.
  * Nothing can report latency (spectral nodes, oversampling filters, a look-ahead limiter).
  * A stolen voice can't be cleared without being rebuilt.
* **Stereo is lifted by running two mono copies** (`stereoCapable`). That is fine for filters, but a chorus, unison
  spread or a stereo oscillator needs both channels in one node.
* **The hot path allocates.**
  * `processStage` calls closures (`some`, `filter`) and keeps a `WeakSet` per block.
  * `processAutomatedRun` allocates per call.
  * Note scheduling builds arrays and closures per block (`TrackRuntime.schedule`).

  None of it is measured as the cause of the F1 overrun, but all of it is garbage on the audio thread.

## Decision

### The node interface

```ts
interface DspNodeV2 {
  /** Called once per block before process. Constant parameters are numbers; varying ones are views on
   * Float32Array(frames) filled by the engine (ramps, routes, automation). Never allocate here. */
  process(ctx: ProcessContext, io: NodeIO, params: ParamFrame): void
  /** Back to the just-created state, without reallocating: voice steal and reuse, transport reset. */
  reset(): void
  /** Optional: an output is known to be silent, so downstream may skip (ADR-0008). */
  readonly silent?: boolean
}
interface ParamFrame {
  /** True if the parameter changes inside this block. */
  varying(index: number): boolean
  /** The value at the block's start (always valid). */
  value(index: number): number
  /** The per-sample values (valid when varying, otherwise filled with value). */
  buffer(index: number): Float32Array
}
```

* Parameters are addressed **by index** (the order of `params` in the definition), not by string id.
* `setParam` stays only for **structural** parameters that need a redesign or a reallocation: an enum, a table choice,
  a sample. Those are declared `rate: 'structural'` and change at block edges.

### What a definition declares (`NodeDefinition` v2)

| Field | Meaning |
|---|---|
| `params[i].rate` | `'structural'`, `'block'` (ramped by the engine, the default) or `'audio'` (a true per-sample buffer, ADR-0004) |
| `params[i].smoothMs` | Ramp time for base changes (default 10 ms; 0 for enums) |
| `ports[i].signal` | Signal kind (ADR-0003) |
| `channels` | How the node handles a signal of N channels (ADR-0006): `'mono'` (sums N to one, or refuses), `'lift'` (one state per channel, run N times: today's stereo lifting, generalized) or `'layout'` (handles the layout itself, declaring the layouts it accepts and produces: panners, encoders, decoders, a stereo chorus, a compressor with a linked detector) |
| `latencySamples(params)` | What the node delays its signal by (0 by default) |
| `tailSeconds(params)` | How long it keeps sounding after its input stops (0 by default; `Infinity` for feedback loops). Used by the bounce, by runtime sleep and by wake-up resets (ADR-0008) |
| `generator` | `true` for nodes that make sound without input (oscillators, noise, samplers, resonators that ring forever). They never sleep (ADR-0008) |
| `active`, `whenInactive` | Generated for every node, like parameter sockets: `active` is a boolean parameter with a socket; `whenInactive` is `off` or `bypass` (ADR-0008) |
| `bypass` | Optional routes from input ports to output ports, used when the node is inactive with `whenInactive = bypass` (ADR-0008). Without them the node can be switched off, but not bypassed |
| `sideEffects` | `true` for nodes whose work matters beyond their outputs (indicators, sends, taps, *Track audio* sources, feedback sends). They are never made dormant (ADR-0008) |
| `stage` | `'voice'`, `'shared'` or `'global'`, as today (`shared`, `global`) |
| `cost` | A rough cost class (A–D) for the CPU budget check and the docs |

### Rules for implementations

1. **Never allocate in `process` or `reset`.** All buffers, tables and state are allocated in `create`. A test runs each
   node under an allocation tracker (a Node `--trace-gc` probe or a counting proxy) and fails on garbage.
2. Inner loops are over `frames` and use locals. Read parameters outside the loop when they are not varying.
3. Feedback state is guarded: denormals flushed (add and subtract a tiny offset, or snap below 1e-20 to 0), NaN reset
   to 0.
4. Determinism follows ADR-0012.
5. Every node has a docs entry (as today) and a test file. Oscillators, filters and shapers also have a **quality
   test**: aliasing measured against a threshold, self-oscillation tuning, level (ADR-0011).

### Engine side

* The compiler builds a flat **plan**: an array of node runs with buffer indices, parameter slots and route tables,
  plus buffer pools. It runs it without per-block closures or allocation.
* `processAutomatedRun` is removed. Automation writes into parameter buffers.
* Buffers are planar with N channels (N fixed when the graph is compiled, at most 16; ADR-0006). Lifted nodes get one
  state per channel. `'layout'` nodes get all N channels at once.

## Options considered

* **Keep `setParam` and add `setParamBuffer`.** Two ways to do one thing, and node authors would have to handle both.
* **Parameters as inputs (everything is a port).** It is the purist's version, but it loses the knob, range and scale
  metadata that panels, presets and morphs depend on.
* **A `ParamFrame` with constancy flags (chosen).** Constant parameters stay as cheap as today, and varying ones are
  explicit.

## Consequences

* **Every node is ported once**, about 70 node types. Most are mechanical (math, logic, controls). About 15 sound nodes
  need care. The registry tests, node-docs tests and example renders catch mistakes.
* The bounce's delay special case becomes `tailSeconds`. Latency reporting makes delay compensation possible later
  (the project has none).
* The allocation test turns "no garbage on the audio thread" from a habit into a check.

## Related

ADR-0004, ADR-0006, ADR-0008, ADR-0011, ADR-0012, ADR-0013;
[engine gaps report](../../active/REPORT-engine-gaps.md) (EG1–EG4, EG17–EG24).
