# The two examples

Both projects are made of nodes: no samples, nothing to download. They are built from code (`src/core/examples`), so they are the same every time, and
every sound in them is a graph you can open, change and put back (**File → Examples** loads either; add `?starter` to the address for the plain
three-track starter instead). Everything below can be done while the music plays.

Where to look, in either one: select a track's name, then **Instrument** (the voice), **Effects** (what sits between it and its fader), **Notes** (what happens to its
notes first) and **Mixer**; each graph has a **Graph | Panel** switch, and **Panel** is the one to play with. The toolbar's **Randomize** and **Mutate** work on whichever graph is on show,
and **Undo** takes a roll back.

---

## Low Light — minimal tech house, 125 BPM, A minor

Eight scenes that play as a track. Launch them in order, or launch a single clip and build your own order.

| Scene | What plays |
|---|---|
| 1 Intro | kick, hat, shaker, a few knocks, dust, a quiet drone |
| 2 Groove | + clap, open hat, the rolling bass, a crash |
| 3 Stab | + the organ chord on the off-beats, with its echo |
| 4 Hook | + the arp |
| 5 Break | no kick, clap or bass: drone, the stab alone, sparse hats |
| 6 Build | the kick pulls out in the last bar, a riser sweeps up, the clap rolls |
| 7 Drop | everything, busier |
| 8 Outro | kick, hat, shaker, bass, drone: the way back out |

The piece is about restraint: a kick that never changes, a bass that sits *between* the kicks (the off-beat 16ths), one chord with a long echo, and a lot of small percussion that interlocks (the open hat on the
"and", the closed hat in between, the knocks that never land on the kick).

### Things to try

* **Hear the sidechain.** Play scene 2, select **Bass**, open **Effects → Panel**. The *Pump* bar is the bass being pushed down by the kick, live. Turn *Duck: Depth* to 0 and the pump goes away; turn it up and it breathes.
  The bass, stab, arp, drone and the echo return all use the same *Kick duck* module: open the Graph, press **Edit** on it, change *Release* once, and all five change.
* **Play the master.** Select **Master** (the last strip), **Effects → Panel**. The long slider is a **DJ filter**: left of the middle it closes a low-pass down, right of it opens a high-pass up. **Cut** mutes the whole mix while you hold it:
  press it in the last beat of the Build and let go on the Drop. The number is the output level in decibels, read by an *Analysis → Level* node.
* **Dub the echo.** Select the **Echo** return, **Effects → Panel**, and hold **Throw**: the echo's feedback rises while you hold it, so what is in the echo builds instead of dying away. (Its time is a dotted eighth at 125 BPM, fixed in seconds: change *Time* if you change the tempo.)
* **Re-tune the kick.** **Kick → Instrument → Panel**: *Tune* is the note it settles on (it is set to A, the key), *Punch* how far the pitch dives, *Ring* how long it sings, *Length* the tail, *Click* the beater.
* **Pull the organ's drawbars.** **Stab → Instrument → Panel** shows *Organ: 16'*, *8'*, *5 1/3'*, *4'*, *2'*. Slide them for a hollow, a round or a bright stab. *Drift* is a Perlin wander on the filter that keeps long loops from repeating exactly.
* **Roll the dice.** **Mutate** (a touch) on **Hat**, **Stab** or **Arp** changes the sound a little each press; **Randomize** goes anywhere in the range the knobs allow. Both leave the wiring alone, so they cannot break a voice. **Undo** brings it back.
* **Change the tempo** (the BPM box): the clock-driven and beat-locked things follow. The bounce (**File → Export audio**) of a scene is the same file every time.

### How it is built, and where to look

* **The kick** is not an oscillator. A 2 ms pulse rings a *low-pass filter with a lot of resonance*, and a fast envelope dives the filter's cutoff, so the ring is a sine that falls in pitch; it dies away by itself and, being started by the same pulse, is **the same on every hit**
  (an oscillator carries its phase from one note to the next, so each kick would attack differently). A little noise is the beater, a *Soft clip* module rounds it.
* **The hats, shaker, clap and crash** are five uses of one module, *Noise hit*: filtered noise (and, for the hats and the crash, six square waves at the inharmonic pitches of an analogue hi-hat for *Metal*), with a decay shaped by multiplying an
  envelope by itself and a *release equal to the decay*, so a hit rings the same however short the note is. The clap is three quick notes (a flam) in the clip.
* **The sidechain** is *Track audio* (the kick's own sound) → *Mono sum* → *Envelope follower* → *Map range* → a stereo *Gain*'s CV. It listens to the audio, not to a pattern, so it ducks wherever the kick sounds.
* **The notes.** The stab's clip is one note a bar; its **Notes** tab runs it through *Chord* (minor seventh) and *Scale lock* (A minor), so the chords come for free and nothing can sound out of key. The arp does the same and then runs the chord with an *Arpeggiator*: sixteenths, up and down two octaves, fourteen notes to a cycle against a bar of sixteen, so the pattern drifts.
* **The groove** is in the clips: a swing of 54 to 60 % on the off-beat sixteenths, a few milliseconds of timing wander and some velocity wander on every part, from a seed, so it is the same every time.
* **The mix** was set by measuring it (loudness of every part and scene, peaks, how the energy falls across the spectrum) rather than guessing: the scenes sit between about -20 (the break) and -15 LUFS, the peaks stay under -2 dBFS, and there is no limiter on the master (the engine's soft clip is the last stage), so the headroom is real.

---

## Glass Rain — self-composing ambient, 92 BPM, D

Six scenes, from fog to storm and back. Nobody typed the melodies here: the clips only hold one note each and say how loud.

| Scene | What plays |
|---|---|
| 1 Fog | the pad, wind, a few drops |
| 2 Rain | + rain, and the bells far away |
| 3 Glass | + the sub, a heartbeat, the bells close |
| 4 Garden | + ticks (a hi-hat that plays itself); the pad is played harder, which **wakes the arp** |
| 5 Storm | everything, as loud as it gets |
| 6 Clearing | the pad, a few bells and drops, the wind |

### Things to try

* **Play the weather.** **Bells → Instrument → Panel**: the XY pad moves *Density* (how often a tick sounds) and *Restlessness* (how fast the melody wanders) together. **Drops**: *Rain rate* and *Pitch range*. **Rain**: *Downpour* and *Brightness*. **Ticks**: *Density* and *Length*. Drag them while it plays.
* **Compose something else.** Press **Randomize** with **Bells** (or **Drops**, or **Ticks**) selected: the wiring stays, the seeds and the knobs re-roll, and the part plays a different melody or rhythm in the same key. **Undo** gets the old one back. Press **Mutate** instead for a variation on what you have.
* **Hush.** **Master → Effects → Panel**: a switch that fades the whole piece down to a murmur and brings it back (a *Switch* into a *Smooth* node into a *Gain*'s CV: look at the Graph).
* **Switch the arp.** The **Arp** track has no clips: its **Notes** tab takes the pad's notes (*Track notes*), keeps only those played harder than 0.75 (*Range split*), moves them an octave up and runs them (*Arpeggiator*). There is an *Arp* switch on the panel of that tab.
* **Turn the bells into a marimba or a glass harmonica.** *Ratio*, *Bright*, *Decay* and *Bend* are on the panels of Bells and Arp (as *Mallet: …*) and of Drops (as *Drop: …*); each use has its own settings.
* **Listen to it drift.** The parts are different lengths on purpose: the heartbeat plays every dotted quarter (three beats against the four of the bar), the ticks loop every 3 bars, the bells every 5 or 7, the drops every 7, the wind every 8, the pad and sub every 16.
  They only all line up again after minutes.

### How it is built, and where to look

* **The bells** (open the Graph of **Bells**): a *Clock* locked to the tempo (its Reset is the note's gate, so it starts on the bar line) → the *Chance* module (a die: the tick sounds if the roll is below *Density*) and a *Perlin noise* wander that a *Sample and hold* takes a value of on every tick → *Scale note* (the position on the scale becomes a pitch: the scale is D suspended pentatonic, D E G A C, which is the rounding of `2.4 × position` to semitones) → the *Mallet*, an FM voice built from nodes: a modulator at 3.5 times the pitch bends a carrier, by an amount an envelope makes fall, so each note starts bright and mellows.
* **The drops** are the same idea with a *Geiger* counter as the clock: a random click draws a position on the scale, the *Mallet* sounds it with a *Bend* (it starts a little low and rises, the way a drop of water does).
* **Everything agrees.** Every note of the pad's chords and of the sub is in the scale the generative parts play, so no matter what the dice do, nothing clashes. The root of a part is a *locked* knob on its panel (Randomize leaves it), and *Octave* is free.
* **The rain** is two Geiger counters (fine patter, high-passed; rarer, longer splashes, low-passed); its **Effects** tab widens it by sending the mono rain to the left and, a few milliseconds late, to the right (a *Control delay*: the Haas effect). Every other part has a Perlin wander into a *Pan* there.
* **Why a voice ends with a Gain.** A self-playing voice keeps ticking after its note ends unless something closes it, so each one passes through a Gain whose CV is an envelope on the note's gate (times the note's velocity, which is how a clip sets the loudness of a scene).
* **Safe to Randomize.** Every node except the controls and the sources of chance is locked, the knobs have musical ranges, and a test rolls every instrument and requires sound that is finite, audible and not blown up. The scenes run from about -23 LUFS (the fog) to -15 (the storm).

---

## For the curious

* The whole of both is in `src/core/examples`: `builder.ts` is the small language the patches are written in (nodes by name, wires as `"osc.out>filt.in"`, a loud error for a wire that does not fit), `score.ts` writes notes as text (`X... x.o.`), and each example has its voices, its modules, its mix and its arrangement in separate files. `ARCHITECTURE.md` has the rules they follow.
* They are deliberately the heaviest projects in the repo (about 40 to 50 % of one core in the slow container the tests run in, for the busiest scene of Low Light). If a scene stutters on your machine, mute a few tracks or lower a track's voices.
* To make your own example: copy a folder in `src/core/examples`, change it, and register it in `examples/index.ts`; the tests hold it to the same checks (it loads back identical, it is well formed, it sounds, Randomize cannot break it).
