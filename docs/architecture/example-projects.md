# Example projects

How the built-in examples are built in code and tested. The user-facing tour is in [guide/examples.md](../guide/examples.md).

Two projects ship with the app and are built **from code**, not stored as files: *Low Light* (minimal tech house, 125 BPM, eight
scenes) and *Glass Rain* (a self-composing ambient piece, 92 BPM, six scenes). A tour of what is in them and what to try is in
[the examples guide](../guide/examples.md); this section is about how they are made and kept honest.

* **A small DSL, so a patch reads like the patch** (`examples/builder.ts`, `score.ts`, `tracks.ts`). `patchOf(nodes, wires)` takes nodes by
  readable id and wires as `"from.port>to.port"` (a module's ports are `<inner node>:<port>`; a parameter socket is `param:<name>`), lays the
  cards out left to right by distance from the sources (a control just before the node it feeds) and **throws on a wire that does not
  fit**, naming it and listing the ports that do exist. It also throws on a parameter that is not there or lies outside its range (a value
  out of range would play now and be clamped the first time the project is saved and loaded: a test pins that a saved copy loads back
  identical, with no warning), and `knob` / `xyPad` refuse a value outside their own range. `moduleOf` builds a module definition the same way
  (`useModule` is a use of it, with per-use values for the controls inside). `drumNotes` and `lineNotes` write notes as text (`X... x.o.`,
  `A1 . C2:2 . A3+C4+E4@0.6`) with a groove that is part of the writing: swing, a little timing and velocity wander, all from a seed.
* **Deterministic.** Every id (nodes, wires, notes, clips, tracks) is chosen, not random, and every random source is seeded, so the project
  is the same JSON on every build and renders the same samples every time (tested). A node id is unique across a track's graphs (`Track.fx`
  shares `setParam` with the instrument), so each graph is built with a prefix (`n_`, `fx_`, `ng_`, `master_`).
* **Safe to Randomize.** Every node is `locked` by default except controls, indicators and uses of modules (`NodeSpec.locked: false` opts a
  seed-bearing source such as a Random or a Geiger back in): *Randomize* and *Mutate* then move knobs and seeds, never the wiring or the
  shape of an envelope, so they cannot break a patch. Knob ranges are written to be musical (a hi-hat's tone cannot leave the hi-hat's
  range), a module's level is an *input* wired from a locked knob in the patch (a use is one node to Randomize: it moves all of the use's
  knobs, or none of them if the use is locked, and the `locked` flag of a node *inside* the module is not looked at), and a test rolls every instrument of both examples and requires finite, audible, un-blown-up sound.
* **No samples.** Every drum is nodes (the kick is an impulse ringing a resonant low-pass whose cutoff dives, so every hit starts the same
  way; the hats are noise plus six inharmonic squares), so the projects are self-contained and every sound has knobs. The envelope node is
  linear, so a voice that should decay naturally multiplies an envelope by itself, and one that must ring its whole length whatever the note's
  length sets *release equal to decay*.
* **Real sidechain.** Low Light's *Kick duck* module takes the kick's sound with *Track audio*, follows its level with the envelope
  follower and turns that into a dip in a stereo Gain's CV; it is used by the bass, stab, arp, drone and echo, so it dips exactly where the
  kick sounds. (The follower's output and a Map range node are all it needs: the fewer audio-rate math nodes, the cheaper: see below.)
* **Self-playing voices** (Glass Rain). A clip holds one note and the patch plays itself: a Clock whose *Reset* is the note's gate (a node with
  nothing wired in would be *global* and free-run, out of step with the bar; wired to the note it becomes a voice node that starts on the bar
  line), a Random as a die against a Density input (*Chance* module), a Perlin wander sampled by Sample and hold on every tick and turned into
  a note of D suspended pentatonic by *Scale note* (`round(2.4 x position)` semitones above the root: 0, 2, 5, 7, 10, 12 ...), sounded by the
  FM *Mallet* module. Every such voice ends with a Gain whose CV is an envelope on the note's gate times its velocity: without it a voice that
  was released would keep ticking until the engine's ten-second cap, so at every loop point the old voice would overlap the new one. The
  note's velocity is also the scene's loudness, and the arp's note graph (*Track notes* of the pad -> *Range split* on velocity >= 0.75 ->
  transpose -> arpeggiator) wakes only in the scenes where the pad is played hard.
* **Scene names** (`Project.sceneNames`, optional): shown under the scene launch buttons and in the export dialog's scene list. A new optional
  field with a safe default, so no format-version bump; the sanitizer keeps at most one trimmed text of up to 24 characters per scene and no
  list at all when no scene has a name. There is no editor for them yet.
* **In the app.** `exampleProjects` is the registry; *File -> Examples* lists them (and the starter), `ProjectFiles.loadExample(id)`
  replaces the project (through the same one-slot backup as every other replace) and shows what to try as an info toast that stays 30 seconds,
  and a first visit opens on `FLAGSHIP_EXAMPLE`. The bundle grew by about 64 kB (18 kB gzipped).
* **Tests.** `examples.test.ts` (both examples: deterministic, loads back identical with no warnings, well formed, every graph acyclic, every
  reference resolves, a panel everywhere), `builder.test.ts` (the DSL), `low-light.test.ts` and `glass-rain.test.ts` (what each claims:
  the kick is the same on every hit, the bass really ducks, the Cut and Throw buttons work, every note is in the key, the scale module only
  makes scale notes, the arp wakes on velocity, the render is deterministic, Randomize cannot break a voice), and the browser check
  `docs/browser-checks/showcase.mjs`.
* **Cost.** These are the heaviest projects in the repo: about 40 to 50 % of one core in the slow container the tests run in for the busiest
  scene of Low Light, 40 % for Glass Rain. Most of it is a floor, not the instruments: every track runs its insert graph every block and sends
  mix per track (about 1.7 % per empty track), the returns' reverbs a few percent, and audio-rate math nodes about 1 % each (they read their
  parameters once per block; it was 2.7 % when they read them per sample), so a long chain of them still adds up. The instruments themselves are a few percent each. If a scene stutters on a slower machine,
  mute a few tracks or reduce voices.
