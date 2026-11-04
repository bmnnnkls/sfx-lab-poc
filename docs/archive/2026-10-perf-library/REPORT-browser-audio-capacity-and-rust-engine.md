---
status: historical
date: 2026-10-18
note: "Research report; the Rust/Wasm direction is listed in docs/IDEAS.md."
---
# Browser audio capacity and a Rust engine

Date: 2026-10-18. Source baseline: `36f71d1` on `codex/performance-and-library`.

**The examples are demanding showcases, but the evidence does not establish that they are too heavy for browser audio. The current notes-automation failure is primarily an engine architecture defect. Rust/Wasm is a credible long-term direction, especially for a native host, but it should not replace the immediate scheduling fix or be justified by this defect alone.**

My recommendation is to retain both full examples as desktop capability tests, offer a lighter first-use experience, fix F1/F3, and measure the resulting production worklet. Then use a bounded Rust/Wasm experiment to decide whether to migrate. The strongest strategic reason for one Rust engine is sharing tested behavior across browser, offline and native hosts; a guaranteed browser speed multiplier is not available.

## Documents and evidence considered

- [EXPLORATIONS](../EXPLORATIONS-2026-10-14.md), especially sections 3, 8 and 10 and the suggested order: Rust/Wasm, native hosting, a document crate, and Wasm plugins.
- [ROADMAP](SALVAGE-claude-branch-2026-10-17.md): these explorations remain proposals, not an approved delivery sequence.
- [IDEAS nodes and controls](../../IDEAS.md): custom DSP in the worklet, shared rather than per-voice expensive processing, preallocation and optional Wasm.
- [EXAMPLES](../../guide/examples.md), the example builders, engine, instrument stages, host/protocol and worklet shell.
- Both [the first F1 assessment](ASSESSMENT-review-critical-F1.md) and [the second opinion](ASSESSMENT-review-critical-F1-second-opinion.md), plus [its proposed remediation plan](PLAN-review-critical-F1-second-opinion.md).

Current Web Audio documentation was retrieved through Context7 and checked against the specification and primary platform documentation linked below. New example measurements and their reproducible harness are in [browser capacity evidence](../../measurements/browser-capacity/README.md). Production code and existing proposals were not changed.

## Are the examples too heavy?

### They are substantially more than small demos

Low Light contains 13 instrument tracks and 3 returns, with 50 allocated voice slots. Glass Rain contains 9 instrument tracks and 2 returns, with 31 slots. They synthesize their sounds from graphs rather than playing prerecorded stems. Low Light includes layered percussion, chord generation, an arpeggiator, sidechain dependencies and return effects; Glass Rain includes continuously evolving control and synthesis graphs.

A runtime inventory found 1,063 compiled DSP stage-node records for Low Light and 721 for Glass Rain, versus 134 for the three-track starter. These counts include all allocated voice slots, including inactive voices, and global/shared/FX/master stages. They exclude note-graph processors and are **not** counts of simultaneously active audio processors. They illustrate why track count alone is a poor capacity metric.

The existing examples document calls them the heaviest projects in the repository and cites an older 40–50% single-core observation in a slow test container. That is historical, machine-specific evidence, not a browser limit or a directly comparable measurement of this branch.

### Unmodified playback has substantial offline headroom on this machine

New measurements: Apple M3 Pro, macOS ARM64, Node v24.21.0, 48 kHz, 128-frame buffers. Each scene starts in a fresh engine, warms for two audio seconds, then renders five successive one-second trials. No extra automation was added. The table reports medians; ranges span the scene medians, not callback percentiles.

| Project or scene | Milliseconds to render one audio second | Render-time ratio |
|---|---:|---:|
| Three-track starter, scene 1 | 15.78 | 0.016 |
| Low Light, all eight scenes | 89.40–133.87 | 0.089–0.134 |
| Low Light, Drop | 121.99 | 0.122 |
| Glass Rain, all six scenes | 74.08–117.66 | 0.074–0.118 |
| Glass Rain, Storm | 117.66 | 0.118 |

These ratios are elapsed engine-render time divided by audio duration, **not measured browser CPU utilization**. The measurements exclude command delivery, status generation, browser scheduling and device I/O. Seven seconds of scene progression does not cover whole arrangements, long generative cycles, sustained thermal behavior or all tail accumulation. Build happened to be more expensive than Drop in this short Low Light run; scene labels are not reliable worst-case selectors.

The earlier second-opinion run measured Low Light Drop at 127.93 ms without the added lane, 152.04 ms with a constant mixer lane, and **4,631.17 ms with one constant notes lane**. The latter is an augmented test project, not the shipped unmodified example. A separate diagnostic with audio mixing suppressed still took approximately 1,570 ms per audio second, exposing the remaining scheduling cost.

**Inference:** the full examples are plausible contemporary-desktop browser workloads after the scheduling defect is fixed. We do not yet have evidence for reliable playback across mobile devices, older laptops or all supported browsers. Shrinking the examples could improve accessibility, but would conceal F1 if used as its remedy: the regression also grows across simple synthetic tracks.

### Change the first-use policy before weakening the showcases

I recommend three explicit roles:

| Role | Proposed workload | Purpose |
|---|---|---|
| Starter | Existing three-track project, or a deliberately authored 4–8-track light arrangement | Fast first sound and room to experiment on a broader device range |
| Desktop showcase | Full Low Light and Glass Rain, including normal automation interaction | Demonstrate the product and serve as required reference workloads on named desktop hardware |
| Stress test | Duplicated tracks, high active polyphony, dense automation and long tails | Find limits; not a promise that every legal project plays live |

The 4–8-track range is a proposed authoring target, not a measured hardware guarantee. Likewise, the current 11–16-track showcases are a defensible desktop target, not a Web Audio track limit. A few expensive per-voice patches can cost more than many simple sample tracks.

The examples' advice to “mute a few tracks” should be revised in a future documentation change. [TrackRuntime.mixInto](../../../src/core/engine/track-runtime.ts#L226) renders the instrument and effects before [ChannelStrip](../../../src/core/engine/channel-strip.ts) applies audibility. Muting can avoid some mixing/send work but does not suspend the expensive DSP or remove notes-lane eligibility. Lowering voice limits can reduce active synthesis but also changes stealing and musical output. Neither is a general safe capacity remedy.

For a light arrangement, reduce actual graph and active-voice complexity, retain shared returns, and validate the authored result. Longer-term freeze/bounce-to-audio is useful, but freezing interdependent tracks requires an explicit policy for taps, sidechains, automation and tails. It is a feature, not an automatic mute optimization.

## What browser audio can realistically promise

### A callback budget, not a fixed number of tracks

AudioWorklet executes custom JavaScript or Wasm on the audio rendering thread. It does not provide a separate real-time core for each track. Creating more worklet nodes is not a portable way to obtain parallel track rendering. The current app already hosts the complete engine in one worklet. [Web Audio specification](https://webaudio.github.io/web-audio-api/#AudioWorklet), [Chrome worklet design](https://developer.chrome.com/blog/audio-worklet-design-pattern/).

For a 128-frame quantum, the audio duration is:

| Engine rate | Duration of 128 frames | Half-quantum engineering target |
|---|---:|---:|
| 44.1 kHz | 2.902 ms | 1.451 ms |
| 48 kHz | 2.667 ms | 1.333 ms |
| 96 kHz | 1.333 ms | 0.667 ms |

These are calculated time budgets, not measured end-to-end latency. Device buffering and browser scheduling affect actual delivery. Doubling the rate roughly doubles sample work per audio second for sample-based DSP and halves this quantum interval; the total performance effect must be measured.

Keep using actual callback lengths. The Web Audio 1.1 specification includes a render-size hint, while current MDN guidance describes 128-frame blocks and warns against assuming that size forever. Support and selected sizes must be checked on target browsers; a larger quantum is not a portable fix to assume. `latencyHint: 'interactive'`, used by this app, is also a request rather than a fixed latency guarantee. [AudioContext options](https://webaudio.github.io/web-audio-api/#dictdef-audiocontextoptions), [process contract](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).

A ring buffer inside the same worklet can adapt block sizes but does not grant extra execution time to an expensive callback. Moving rendering ahead into a Worker can trade latency for scheduling flexibility, but the worklet must consume available data without waiting. That is a different product tradeoff for live MIDI and controls. [Chrome design patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern/).

### The realistic near-term target

For this product, aim for full showcase playback and editing at 44.1/48 kHz on a named modern desktop reference, with a lighter starter on lower-powered devices. Treat 96 kHz as a separately measured higher-cost mode. Do not promise workstation-scale arbitrary patches, every mobile browser, or a fixed “maximum voices” count without a defined patch and active-polyphony workload.

Retain the proposed p99 engine-render target below half a quantum, alongside no observed over-budget calls or output discontinuities in the acceptance window. Also measure the **whole worklet callback**: [the shell](../../../src/audio/worklet/engine-processor.ts) constructs and posts status at about 30 Hz and on clock changes. [Engine.status](../../../src/core/engine/engine.ts#L236) traverses readouts and allocates records; commands can rebuild graphs on the worklet side. Timing only `render` misses those costs.

Validate steady playback, editing, launch bursts, tempo changes, startup and long-running tails separately. Record actual sample rate, quantum, browser/OS/device, cold versus warm operation, p50/p95/p99/max, over-budget counts and output continuity. Run full arrangements and extended generative playback after the initial 60-second diagnostic. A fast offline average cannot establish reliable live playback.

## What Rust and Wasm would change

| Approach | Likely value | What it does not solve automatically |
|---|---|---|
| Correct and optimize TypeScript | Removes current whole-engine per-sample work; lowest migration risk; preserves existing tests | JS allocation/JIT concerns and browser/device limits still require measurement |
| Selected Rust/Wasm DSP kernels | Explicit data layout, optimized numerical loops, potential SIMD gains; limited experiment | Existing JS scheduling, automation ownership and worklet status costs remain |
| Whole engine in Rust/Wasm | One runtime implementation; explicit scratch/event storage; fewer JS objects in rendering | Bad scheduling algorithms, audio-thread allocation, browser deadlines or host messaging |
| Same Rust core with a native audio host | Direct device integration and a foundation for standalone/headless use | Real-time correctness, bounded work, driver portability and dependency-aware parallelism |

Rust's ownership model avoids requiring a tracing garbage collector for ordinary Rust data. This makes memory lifetimes easier to control, but allocations and drops still occur where the program puts them. A render loop that repeatedly grows vectors, allocates maps or destroys large graphs is not real-time-safe merely because it is Rust. [Rust ownership and allocation](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html).

Wasm SIMD can accelerate suitable numerical loops; dependency-heavy scalar control flow and event dispatch benefit less predictably. Benchmark the actual kernel and its integration rather than assuming automatic vectorization or a particular speedup. [V8 SIMD documentation](https://v8.dev/features/simd).

The exploration's implication that Wasm removes compilation variability needs qualification: V8 uses baseline and optimizing Wasm compilation tiers. Compile/load before playback and measure cold/warm behavior. Rust/Wasm does not mean “no runtime compilation.” [V8 compilation pipeline](https://v8.dev/docs/wasm-compilation-pipeline).

### The integration boundary matters as much as the language

For a future whole engine, prefer one coarse render call with reusable linear-memory buffers and compact timed events. Keep graph construction and expensive preparation off the active render path where feasible; publish prepared changes at defined boundaries. Budget sample transfer, command parsing, old-graph reclamation and bounded queue overflow explicitly. Avoid JSON serialization, locks, memory growth or per-sample JS/Wasm crossings during rendering.

In a conventional worklet/Wasm design, audio arrays and Wasm linear memory require copies at the boundary. Copying the final stereo output once per block is a different cost from crossing for every node, voice and sample. Compile and initialize before audio starts. [Chrome Wasm integration patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern/).

A numerical illustration: if a kernel accounts for 20% of total render cost, making it four times faster improves the whole engine by only `1 / (0.8 + 0.2 / 4) = 1.18` times, before integration overhead. This is an assumed example, not a forecast. The current scheduling-only diagnostic is a concrete reason not to choose an expensive reverb as the sole proof that Rust fixes F1.

## Assessment of the earlier Rust proposals

| Proposal in EXPLORATIONS | Assessment now |
|---|---|
| One Rust engine, browser and native hosts | Sound destination if native/headless capability is a product goal. Keep I/O outside the core and preserve the command/render/status boundary. |
| TypeScript engine as reference | Useful during migration, after F1/F3 semantics are resolved. Known wrong helper timing must not become the parity contract. Keep expected-event assertions as well as audio comparisons. |
| Do not maintain two engines | Correct as an end state. Temporary dual execution is necessary for migration; freeze the reference and define when it can be retired. |
| Expensive DSP nodes first, then whole engine | Sensible portability experiment, but insufficient as the performance experiment here. Include scheduling/automation storage, or profile the corrected engine before choosing the first kernel. |
| Move document validation/migrations/diff into Rust | A separate substantial migration, justified by a headless project loader rather than browser DSP speed. Preserve the current document code during an initial audio experiment. |
| Tauri with Web Audio is inherently worse than Chrome | Too categorical. Tauri uses platform webviews, so behavior depends on the actual platform/runtime. A shell alone is not an engine optimization; native audio is the meaningful architectural change. |
| Wasm threads raise the ceiling | Possible, with deployment and latency costs; not automatic parallel worklet execution. Start with a single-threaded core. |
| One Wasm binary makes output identical everywhere | A useful portability goal, not sufficient proof of parity, especially when comparing a separate native Rust build. Test numerical behavior and deterministic state explicitly. |
| General Pd/Faust/plugin interface first | Valuable product exploration, but it adds a second runtime/ABI problem while the core scheduler is unresolved. Keep it outside the performance repair and first engine experiment. |

Tauri's documented webviews differ by platform. A native callback should call the engine directly; the webview/IPC connection should carry commands and bounded telemetry, not synchronous per-buffer rendering requests. CPAL provides device streams and callbacks, with scheduling behavior depending on the platform. Plugin hosting, a parallel graph scheduler and device recovery remain additional engineering work. [Tauri process model](https://tauri.app/concept/process-model/), [CPAL documentation](https://docs.rs/cpal/latest/cpal/).

Shared Wasm memory across browser threads requires the relevant secure-context and cross-origin-isolation conditions. Plain single-threaded Wasm does not require that threading deployment model. The Pages/service-worker workaround in the exploration should be evaluated as a separate hosting choice, not made a prerequisite for an initial port. [Shared memory requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer).

For parity, specify precision, rounding, seeded randomness, math implementations, event ordering and sample-rate behavior. Preserve the existing audio tolerance initially, investigate differences, and approve any deliberate change. Wasmtime documents remaining nondeterminism and configuration choices; the same source code is not a blanket bit-identical-output guarantee. [Wasmtime deterministic execution](https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html).

The plugin discussion also conflates memory isolation with scheduling isolation. A sandboxed module can still monopolize a render callback. Wasmtime offers interruption mechanisms, but their existence does not create a portable real-time plugin budget in the browser. Per-instance memory and a 64-frame plugin block can introduce cost and timing adaptation; “cheap per voice,” “sandboxed for free” and the 1.2–2 times Wasmtime overhead estimate need dedicated evidence. [Wasmtime interruption mechanisms](https://docs.wasmtime.dev/examples-interrupting-wasm.html).

The older engine-size estimate is still roughly the right order: the seven named engine directories currently contain 8,847 non-test TypeScript lines across 110 files. Automation/control/patch add another 2,285 lines across 40 files, with other dependencies beyond those. Line count is not a delivery estimate. Porting ownership, graph edits, automation, stereo/tails and all host lifecycle contracts is likely more consequential than translating numerical nodes.

## Recommended sequence and review points

1. **Complete the current engine correction.** Resolve the pending F1/F3 decisions and implement the proposed timeline/storage repair. Maintain sample precision and tails. A Rust decision does not waive the branch's existing merge blockers.
2. **Prove a browser capacity envelope.** Measure the corrected production worklet on the M3 Pro reference and a named lower-powered device. Test required browser families rather than extrapolating Chromium results. Publish results by workload, sample rate and active polyphony. Decide whether the full examples remain the default or become explicit showcases.
3. **Run a bounded Rust experiment.** After profiling, compare optimized TypeScript with a Rust implementation of a measured hot path. Include a note/automation scheduling workload and at least one representative DSP workload, with coarse block calls. Run the same Rust core in browser Wasm and a native offline harness. Measure whole-engine/callback benefit, memory, startup, cold/warm behavior and parity; do not rely solely on kernel throughput.
4. **Make the migration decision from results and product goals.** If browser performance is sufficient and native use is speculative, retain the corrected TypeScript engine. If native/headless deployment is committed, one Rust core is strategically attractive even without a dramatic browser speedup. Before porting everything, approve the ABI, state/ownership model, error policy, host matrix and numerical contract.
5. **Add native audio and broader platform features separately.** First prove a minimal device callback host; then consider the desktop shell, headless document loading, multithreading and plugins. Retire the TypeScript reference only after browser/native/offline parity and lifecycle gates pass.

Three product decisions remain for review: **the minimum supported device/browser workload, the default example policy, and whether native/headless operation is a committed goal.** The existing F1/F3 compatibility and acceptance decisions also remain pending. This report recommends a sequence; it does not approve a rewrite, reduce supported behavior or change the examples.
