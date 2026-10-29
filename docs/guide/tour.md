# A tour of SFX Lab

A hands-on walk through the app, starting from the plain starter project (add `?starter` to the address). For the two
example songs, see [examples.md](examples.md). Everything here can be done while the music plays.

## The workbench

The window is a workbench in the spirit of VS Code. The **activity bar** on the left opens Session, Arrangement, Wave
editor and Library. The **primary sidebar** holds Samples, Library and Tracks. The **secondary sidebar** holds Sounds
and Pinned. The **panel** under the editor area holds Instrument, Effects, Notes, Clip and Mixer. Drag any tab to dock
it elsewhere, and save the arrangement from **View → Layouts**, which also has four built-in layouts (*Compose*,
*Arrange*, *Sound design*, *Mix*).

## Play

Click **▶ 1** (scene 1): the Bass, Lead and Pad clips launch on the next bar and loop. **Space** plays and stops.

## Build a sound

Select a track name, then edit its instrument in **Instrument**:
* Drag nodes by their header. Drag from an output dot to an input dot to wire, and click a wire to remove it. Sliders
  change the sound live.
* Besides oscillator, filter, envelope, gain and delay there are an **LFO** (wire it into a filter `Cutoff`, an
  oscillator `Pitch` or a gain `CV`) and a **Reverb**.
* Select nodes (Shift-click, or drag a box) and choose **Group into module** to make a reusable module: edit it once
  and every use changes, or **Unlink** a use to make it independent.

Beyond the sound nodes there are:
* **control nodes**: knobs, sliders, XY pads, switches and push buttons, selectors
* **indicators**: LED, number display, bar meter, showing live values
* **math and logic** nodes: clock, counter, schmitt trigger and more
* **analysis** nodes: envelope follower, level in dB, pitch detector
* seeded **noise, Perlin noise, Geiger clicks** and a **Random** value
* ready-made **example modules** under *Add → Examples*: an overtone oscillator, a drawbar organ

**Randomize / Mutate** in the toolbar re-rolls the settings from a seed; lock a node to keep it.

## Panels

Every graph has a **Graph | Panel** switch. *Panel* shows the graph's control nodes to play with instead of nodes and
wires. A control is a node you wire into any parameter: right-click a parameter socket, or use *Edit panel*, to make
one already wired. *Edit panel* adds, hides, renames, resizes and reorders controls. A pad moves two parameters at
once, and one drag is one undo step. **Pin** a panel to keep it in the Pinned sidebar while you work elsewhere.

## Notes

**Notes** holds the track's **note graph**. Wire the clip's notes through effects (scale lock, chord, arpeggiator,
echo and more). You can split a stream, treat the branches differently and merge them again, or mix in the notes of
another track with *Track notes*.

Click **✎** on a clip to open it in **Clip**, the piano roll:
* Drag on empty space to draw a note of any length, drag a note to move it, and drag its ends to resize.
* Shift-click selects several notes and Ctrl-drag selects a box. **Del** deletes, and Ctrl+C / X / V copy, cut and
  paste at the mouse.
* The lane under the roll sets velocities. Notes play as you edit them (toggle **Audition**), and the roll can follow
  the playhead.
* Change the clip's **Length** (or hit **Double**). Zoom with the slider or Ctrl+wheel.
* Open **Groove** for quantize, swing and humanize.

## Effects, routing and mixing

* **Effects** gives every track an insert graph from *Track in* to *Track out*. Sound can be **stereo** there: *Pan* a
  mono track, widen it, run a filter or delay in stereo (the **M / L R** switch on the node), or use *Stereo reverb* and
  *Ping-pong delay*.
* Add a **Return track** from the `+` menu, give it a reverb, and put a **Send** node in other tracks' effects to share
  it.
* A **Track audio** node plays another track's sound inside a track's effects, for parallel chains or sidechains.
* **Groups**: group tracks from a track's menu or by dragging in the **Tracks** tree. A group can **sum to a bus** with
  its own effects, fader and sends, and every group has mute and solo.
* **Mixer** has a strip for every track, group bus, return and the master: pan, **mute** and **solo**, a fader, a
  meter, and a **send knob** per return.
* The **Master** strip has its own effects graph on the final mix.

## Samples and audio

* In **Samples**, choose **Add demo samples** (or import or drag in your own audio) and press ▶ to audition. **New
  sampler track** makes a playable track. **New audio track** plays a sample as a tempo-locked, looping **audio clip**:
  try *Demo Drum Loop 120 BPM*, then change the BPM and watch it follow. Open the clip to trim it and set fades.
* **Wave editor** (activity bar, ✎ on a sample, or *Edit sample* on a clip, region or sampler) shows the sample in
  stereo, with an overview, a ruler in time or beats, and a selection. Edits change the sample **in place**, with undo,
  and every clip using it follows: gain, fades with five curves, normalize, reverse, silence, DC offset, and cut, copy,
  paste, delete, crop and insert silence with a crossfade at every join. Turn on **Edits make copies** to keep the
  original instead.

## Arrange

Open **Arrangement** (activity bar, or Tab). Drag a session clip onto a lane, or right-click an empty lane to place
one. Drag regions to move them and drag an edge to resize, then press **▶ Arrangement** to play the timeline.

## Keys, files and export

* **⌘K** (Ctrl+K) opens the **command palette**: find any command, or what can be done to what is focused or selected
  (*Bass: Duplicate*). **Delete**, **⌘D**, **⌘C**, **⌘X**, **⌘V** and **F2** act on the focused thing, a graph's
  selected nodes included. ⌃⌘B, ⌃⌘J and ⌃⇧⌘B (Ctrl+Alt elsewhere) toggle the sidebars and the panel.
  **View → Keyboard shortcuts** lists every key and lets you change it, per browser.
* **Undo / redo**: ⌘Z / ⇧⌘Z. Dragging a slider or a node is a single step.
* Your project **autosaves in this browser**. **File → Export / Import** moves projects as `.sfxlab.json` files, or
  `.sfxlab` packages when they have samples. **File → Restore previous** swaps back after a replace.
* **File → Export audio (WAV)…** renders the open clip or a scene offline to a stereo WAV (16-bit or 32-bit float,
  44.1 or 48 kHz), with a tail and optional normalize. The same project always gives the same file.
