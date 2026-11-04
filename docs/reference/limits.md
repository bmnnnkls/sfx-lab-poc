# Known limits

Deliberate limits of the proof of concept. Accepted performance limits are in [STATUS.md](../STATUS.md#accepted-limits).

* One clip plays per track. Polyphony has simple voice stealing and no unison, glide or legato modes.
* Audio clips have no time-stretch (only re-pitch or original speed), no loop crossfade (a loop whose ends don't
  match will click unless you add fades) and no recording. Trim is non-destructive but there are no separate loop
  points inside the region. An audio clip plays its sample's two channels when its track's `Track in` is in stereo (new
  audio tracks); tracks saved before round 11a play the mono average until switched.
* The piano roll assumes 4/4 for the ruler and its clipboard is not shared with the OS clipboard. Groove tools are
  destructive edits (undoable), not a reusable groove pool; swing and quantize use the toolbar grid, which has no
  triplet options yet.
* Samples keep one or two channels (more are averaged to one); instruments, the sampler included, play them mono. At
  most 120 s / 32 MB per imported file. Sample edits write 32-bit float WAV (a 120 s stereo edit is 46 MB, so dragging
  that file back in from disk is refused by the import cap). Files edits wrote are cleaned up a day after nothing names
  them; imported bytes stay in IndexedDB after a sample is removed from a project (so undo works), with no cleanup yet.
  The engine and the main thread each keep up to 128 MB of decoded audio for undo.
  `decodeAudioData` resamples to 48 kHz, and the sample's reported rate is that decoded rate.
* Sample hashing needs a secure context (https or localhost).
* A node's stage is decided by its type (`shared`) and wiring; there is no per-node override.
* Oscillators are naive (alias at high pitches); no band-limiting or oversampling. The plain Reverb is mono (use *Stereo reverb* in an insert graph). Filter cutoff has a linear slider over 20 Hz–20 kHz.
* Launch quantisation is fixed at one bar; no audio/note recording or plugin hosting.
* Note sync reaches nodes that run per voice (the filter's key tracking, the Comb); the shared Delay and Ping-pong only know the tempo, not
  which note is playing.
* History is per session (not saved) and does not cover selection or transport.
* One autosaved project per browser. Two tabs on the same site overwrite each other (last write wins).
  `localStorage` holds ~5 MB, plenty for projects, not for samples (see above).
* Targets desktop Chromium/Firefox. Safari/iOS quirks are untested.
