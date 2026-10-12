# Retro: the example projects session (Low Light, Glass Rain)

**The ask:** the old demo (three tracks on default patches) was lame. Make two example projects that make you want to play: one minimal tech
house, one of Claude's choosing, showing off what the app can do. Then "think again" and add what sets them apart from slop.

**The result** (merged as PR #6, about 3,700 lines in 70 files): `core/examples` with a small DSL for writing patches and scores, *Low Light*
(minimal tech house, 125 BPM, 8 scenes) and *Glass Rain* (self-composing ambient, 92 BPM, 6 scenes), optional scene names, *File → Examples*,
a first visit that opens on Low Light, 57 new unit tests, a 25-check browser check, and `docs/EXAMPLES.md`.

**The constraint that shaped everything:** the session could not listen. Every judgement about sound was made by rendering offline with the
real engine and measuring (spectrograms, loudness, pitch and onset tracking, a click detector, stereo and band energy). Nobody has heard these
projects yet. The first thing to do with them is to listen and tune by ear.

---

## Chronological summary

1. **Exploration.** Read the node registry, the data model and `ARCHITECTURE.md`. Found that `createDemoProject` is a fixture for many unit
   tests and for 20 browser checks, so it was left alone and the new projects went into a new module beside it.
2. **A way to hear.** Scratch scripts loaded the repo's TypeScript through Vite's SSR loader and called `renderProject` (the same engine as
   the worklet). Python and ffmpeg turned the WAVs into spectrograms (read as images), LUFS and peak figures, pitch and onset lists, band
   energy and a click detector (checked first against injected clicks).
3. **The DSL.** `patchOf(nodes, wires)` with readable ids and `"from.port>to.port"` wires, an automatic left-to-right layout, and a thrown
   error for any wire that does not fit; `drumNotes` / `lineNotes` for notes as text, with seeded swing, timing and velocity wander.
4. **The kick, twice.** The first kick (a sine with a pitch envelope) was cut off at the end of its 16th note (release shorter than decay) and
   driven flat-topped. Measuring hit-to-hit correlation showed a deeper problem: from -0.9 to +0.95, because oscillators carry their phase
   from note to note. Rebuilt as an impulse ringing a resonant low-pass whose cutoff dives (the analogue drum-machine way): 0.993 on every hit.
5. **Low Light.** Four modules (soft clip, kick duck, noise hit, organ), the drums, bass, stab, arp, drone, riser, crash and dust, three
   returns, a master with a DJ filter, eight scenes. It rendered on the first try at 41 % CPU in the container.
6. **CPU.** Profiling showed the instruments cost a few percent each; the floor was about 30 % with no clip playing: every track runs its
   insert graph and sends every block, and every audio-rate math node does a `Params.get` per sample. The duck lost three of its math nodes.
7. **Levels by measurement.** A script rendered every track solo, measured LUFS against targets relative to the kick and suggested faders.
   The master's `tanh` soft clip meant keeping internal peaks low; the bass was far too saturated and was cleaned up.
8. **Into the app.** Registry, *File → Examples*, first-run welcome, `?starter`. Playwright screenshots of the patcher, panels and mixer were
   the visual review; the real AudioWorklet played the project in headless Chromium with the master panel reading a live -13.3 dB.
9. **Glass Rain.** The design question was how a patch can play itself in time: a node with nothing wired in is *global* and free-runs out of
   step with the bar, but a Clock whose Reset is the note's gate becomes a voice node that starts on the bar line. Then: modules for an FM
   *Mallet*, a *Scale note* (D suspended pentatonic as `round(2.4 × position)`) and a *Chance* gate. Problems found by analysis and fixed:
   a released self-playing voice keeps ticking (up to the engine's 10 s cap), so every voice now ends in a Gain on the note's gate; the melody
   was static (9 distinct pitches after widening the wander); the sub at 37 Hz held almost all the energy, below what laptops reproduce;
   the heartbeat was tuned a tritone off the key; a chord tone (F) sat outside the scale the generative parts use.
10. **Randomize.** A sweep that randomized every instrument with several seeds found silence (2 of 6 seeds on the bells), out-of-key notes
    and a clap at 0 dBFS. Causes: unlocked envelopes could roll a 4-second attack onto a hi-hat; a module's own controls re-roll with its use
    and `locked` inside a module does nothing; an enum (a filter's mode) re-rolled and changed loudness by about 15 dB; Metal on a clap.
    Fix: the DSL locks every node except controls, indicators and module uses by default; levels and keys live in locked knobs outside the
    modules; each voice has knob ranges that suit it.
11. **Round trip.** Saving and loading again changed one value: a Gain of 2.4, clamped to 2 by the sanitizer. The DSL now refuses any value
    outside its parameter's range, and a test requires a project to load back byte for byte with no warnings.
12. **Tests caught real bugs.** The determinism test found that tracks without their own graphs took the app's default graphs, whose ids are
    random. The scale test found that the *Octave* input of *Scale note* defaulted to 1 (a Multiply's unwired operand), an octave too high
    unless a knob was wired, and that fractional positions gave chromatic notes. The test files were split so vitest runs them in parallel
    (the suite went from 14 s to 30 s).
13. **Polish.** Scene names (an optional field, shown under the launch buttons and in the export dialog). The welcome note shows once per
    browser. 33 existing browser checks moved to `?starter` and all passed, plus `showcase.mjs` (25 checks: the gestures, Randomize and Undo,
    Hush, Cut, every panel). A last read of the code found that the bells retuned and re-scaled the ringing tail of the last note on every
    tick the die turned down; both now change only when a note sounds.
14. **A git mistake.** A hurried command ran `git commit --amend` and rewrote the merge commit at the tip of the branch. Recovered at once
    with `git reflog` and a soft reset; nothing was pushed in that state. (An earlier `pkill -f "vite preview"` also killed the shell that ran
    it, because the pattern matched its own command line.)

---

## What worked

* **Rendering as ears.** The offline bounce is the same engine as the browser, so analysis of a WAV is analysis of what a user hears. It
  found things a listener would notice (inconsistent kicks, an inaudible sub, clipping, flat melodies) and things a listener might not
  (a tritone in a long ring, phase incoherence).
* **Measuring before believing.** Spectrogram smudges looked like low-frequency junk; band energy said -74 dB. FM bells fooled the pitch
  tracker; the module was then tested numerically instead. Each time, a number settled what a picture suggested.
* **A DSL that fails loudly.** Wire checks, range checks and duplicate-id checks turned every typo and out-of-range value into an error at
  build time, naming the node and listing the ports that do exist. Several real bugs died this way before they could make a silent gap.
* **Property tests over the whole project.** Determinism, round trip, "every reference resolves", "every note in key", "Randomize cannot
  break a voice": cheap to write once, and each caught a bug nobody was looking for.
* **Screenshots as design review.** The patcher layout, the panels and the scene names were judged from real screenshots, which also showed
  truncated titles ("Kick duck: Rele…") that were then renamed.
* **Leaving the fixture alone.** Keeping `createDemoProject` and steering the browser checks with `?starter` kept 33 checks and dozens of
  unit tests green without touching them beyond one line each.

## What didn't

* **No listening.** Balance, timbre and groove are only as good as the measurements and the theory behind them. Someone has to listen.
* **First drafts were often wrong in ways a slower start would have avoided** (the oscillator kick, the release cut, Randomize safety, the
  default-1 operand, the 2.4 gain). Each was caught, but several cost a round of rework. The engine facts below would have prevented most.
* **CPU.** The busiest scene of Low Light is about 45 % of one core in the container. It is mostly the engine's per-track and per-sample
  overheads, but examples this heavy will stutter on a slow machine.
* **Editing code with scripted find-and-replace** left junk (a `.replace(...)` inside a wire list, a filter that did nothing) that needed a
  cleanup pass. Small edits through the editor would have been cleaner.
* **Test time doubled.** The render tests are worth having, but 30 s for the suite is a real cost to everyone.
* **The git slip.** Combining staging, committing and an `--amend` in one hurried command is how a merge commit got rewritten.

---

## Learnings to persist

Engine facts that are easy to get wrong (worth a section in `ARCHITECTURE.md` or a `CLAUDE.md`):

* **Oscillators keep their phase between notes** (a voice's nodes are not reset when it is reused), so anything that must start the same
  way every time (a kick) should be excited, not oscillated: a pulse into a resonant filter.
* **Envelopes are linear.** Multiply an envelope by itself for a natural decay; set **release equal to decay** for a one-shot that rings its
  whole length whatever the note's length.
* **A node with nothing wired in is global** and free-runs from engine start, out of step with the bar. Wire the note's gate into a Clock's
  Reset (or a Perlin's Retrig) to make it a voice node that starts on the note.
* **A released voice keeps running until it is quiet for 50 ms or 10 s have passed.** A patch that makes sound by itself must close a Gain on
  the note's gate.
* **An unwired math operand is its parameter, and a Multiply's defaults are 1.** An "octave" input that should default to 0 needs `a: 0`.
* **The sanitizer clamps out-of-range parameters on load.** A value outside the range plays now and changes after the first save.
* **The app's default graphs take random ids.** Code that must be deterministic builds its own.
* **Randomize locks are per node, and a module use is one node.** `locked` inside a module is ignored; an enum (a filter's mode) re-rolls
  with the rest and can change loudness by 15 dB.
* **The master ends in `tanh`.** Keep internal peaks under about 0.5 for a clean mix.
* **Audio-rate math is expensive** (a `Params.get` per sample per node), and every track costs about 1.7 % idle.
* **Module port ids are `<inner node>:<port>`**, parameter sockets are `param:<name>`.

Process:

* For anything that makes sound, render it and measure it before calling it done; keep the scratch tools (loader, `an.py`, LUFS, clicks).
* Put validation into the tool that builds things, not into a review afterwards.
* Run a Randomize sweep and a save/load round trip on any shipped project.
* Commit with one plain `git commit` per step; never chain `--amend` into a command; check `git log` right after.
* Avoid `pkill -f` with a pattern that also appears in the command running it.

---

## How the app could be improved

### Bugs and rough edges found on the way

* **A self-playing voice outlives its note by up to 10 s** unless the patch closes it. The engine could stop rendering a released voice
  whose output sinks are fed only by nodes downstream of the gate, or offer a "voice ends with the note" option.
* **Oscillators have no Sync or Reset input**, so phase-consistent attacks need a workaround.
* **Randomize re-rolls enums** (filter mode, waveform, noise colour, a Random's `voices`), which is rarely what anyone wants from a "variation".
* **Unwired operands default silently.** A card could show an unwired operand's value, so a Multiply quietly multiplying by 1 is visible.
* **The default graphs take random ids**, so two "new project" builds are never identical (it matters for tests and diffs, not for users).
* **Delay times are in seconds**: echoes drift off the grid when the tempo changes.
* **No CPU or under-run indicator**: a stutter on a slow machine has no explanation.
* **The bundle is 692 kB** (Vite warns at 500 kB); the examples could be a lazily loaded chunk.

### Missing essentials (what made the examples harder to build than they should have been)

* **Dynamics:** a compressor (with a sidechain input) and a limiter on the master. The kick duck and the soft clip were built from up to
  seven math nodes each.
* **A waveshaper / distortion node**, and band-limited oscillators (saw and square alias today).
* **Envelope curves** (exponential segments), instead of squaring.
* **Tempo-synced time** for Delay and Ping-pong (a note-length unit, as the LFO and Clock have).
* **A step sequencer or lookup-table node**, a modulo node, and a scale quantizer for signals (the examples use the `round(2.4 × n)` trick).
* **Per-parameter locks** for Randomize.
* **Note-graph tools**: probability per note, a random/generative note source, arpeggiator rates with dotted and triplet values, swing in
  the arpeggiator.
* **Scene names you can edit** in the session view, and launch quantization other than one bar.
* **Automation** (recording a knob's movement) and **MIDI input with learn**, so the panels can be played with hands.

### What a community of users would likely ask for

* **Sharing:** a link to a project, a library of patches and modules others made, and "save this module as an example".
* **Presets and snapshots**, and morphing between two with an XY pad.
* **An arrangement view** to turn scene launches into a song, and **stem export**.
* **Sample packs and a drum rack**, recording audio in.
* **More effects:** chorus, flanger, phaser, EQ, bit-crusher, granular delay, a convolution reverb.
* **Visual feedback:** a scope and a spectrum on the panel, and meters inside patches.
* **Hardware and other tools:** MIDI controllers, MPE, Ableton Link, WebAudio Modules (WAM) plugins.
* **Touch and tablets:** the panels are close to an instrument already.
* **Learning:** an in-app tour of an example, "what does this node do" on hover with audio, and more examples in other styles.
