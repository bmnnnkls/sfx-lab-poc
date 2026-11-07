---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0007: Voice architecture: modes, unison, glide, stealing, per-voice facts

## Context

What the voice layer does today (`instrument/voice-pool.ts`, `voice.ts`):

* **Allocation.** Up to 16 voices per track. A new note takes a free voice; otherwise it steals one that is releasing,
  else the oldest.
* **Stealing is a hard cut.** The stolen voice's state carries on into the new note: its envelope retriggers from its
  current level, and its filter keeps its state.
* **There is no mono mode, legato, glide, note priority or unison** ([limits](../../reference/limits.md)).
* **A voice knows little.** It knows frequency, gate, velocity, a trigger counter, and the track's pressure and bend.
  It doesn't know its note number, release velocity, a random value of its own, or its unison lane.
* **Expression is per track.** The wheel and pressure bend every voice alike, so MPE is impossible (BACKLOG D2).

These are table stakes for a flagship, and the flagship's voice-core contract (ADR-0003) depends on them.

## Decision

1. **Voice modes per instrument** (saved with `voices`):
   * `poly` (as today);
   * `mono` (a held-note stack; the envelope retriggers on every note);
   * `legato` (mono; no retrigger while a key is held).

   Note priority for mono and legato: `last` (default), `low` or `high`. Releasing a key returns to the previous held
   note.
2. **Glide** is a voice-level pitch slew, in the pitch domain (ADR-0003).
   * Mode `off`, `always` or `legato only`.
   * Time constant either *time* (seconds to reach the target) or *rate* (seconds per octave).
   * It works in poly mode too: each new voice glides from the last played pitch.
3. **Unison is lanes inside a voice**, not extra voices. It is a per-instrument setting:
   * `unison` 1–8 lanes;
   * `detune` (cents, spread across lanes on a curve);
   * `spread` (stereo, ADR-0006);
   * `blend` (centre against side lanes).

   Phase is random per lane at note-on, seeded (ADR-0012). The voice runs its stage **once per lane**, and the lanes'
   outputs are summed with a gain of 1/√N. Envelopes and stealing stay per note. A unison-aware oscillator may handle
   lanes internally for speed (ADR-0005, `cost`); the generic per-lane path works for any patch.
4. **Stealing.** In order:
   1. Steal a released voice, the quietest first. A voice already measures its peak.
   2. Otherwise steal the oldest held voice, protecting the lowest and the highest held notes.

   A stolen voice **fades out over 3 ms** in a spare slot while the new note starts. The pool keeps one hidden spare
   voice for this. Voice state is reset with `reset()` (ADR-0005), not inherited. Exception: in legato mode the voice
   keeps its state (that is the point of legato).
5. **Voice count** up to 32 (unison lanes don't count). Allocation never allocates memory.
6. **Per-voice facts on the Note node**, in addition to `pitch`, `frequency`, `gate`, `velocity`, `pressure` and `bend`:
   * `note` (the unbent note number);
   * `release` (release velocity, 0..1);
   * `random` (uniform 0..1, rolled at note-on);
   * `lane` (−1..1 position of the unison lane; 0 without unison);
   * `age` (seconds since the note started);
   * `slide` (CC74 per note; 0 until MPE);
   * `voice` (the note's index among sounding voices; the hook for later per-voice spatial placement, ADR-0006).
7. **MPE-ready but not MPE.** The per-voice expression slots (`bend`, `pressure`, `slide`) are per voice. In this PI
   they are filled from the track's values. MPE (BACKLOG D2) later fills them per note without touching nodes.

## Options considered

* **Unison as extra voices (stacked notes).** Simple, but stealing and polyphony counts get confusing, and spread has
  to be faked by note-on panning.
* **Unison only inside oscillator nodes.** Cheap, but a filter or shaper per lane, which per-voice character relies
  on, becomes impossible.
* **Lanes in the voice, with an optional fast path in oscillators (chosen).**

## Consequences

* Running the stage per lane costs N× for that voice. The budget check (ADR-0015) keeps presets honest. Wavetable and
  VA oscillators take the fast path, handling lanes internally while the rest of the stage runs once (a "unison
  scope" boundary decided in the spec).
* The note graph is unaffected. Arpeggiators and chords still send notes.
* Tests: note priority stacks, legato with no retrigger, glide times, no click on steal (a measured discontinuity),
  deterministic unison phases.

## Related

ADR-0003, ADR-0005, ADR-0006, ADR-0012; BACKLOG D2 (MPE).
