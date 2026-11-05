# Mixing and routing

Insert graphs, stereo, returns and sends, the master bus, the mixer (mute and solo rules) and Track audio.

## Effects on tracks (the insert graph)

Every track, instrument or audio, has an **insert graph** (`Track.fx`, a `Patch`) between its own sound and its fader:
`Track in -> effects -> Track out`. A fresh track has just the two ends wired together, which passes the sound through
bit for bit. It is the same machinery as everything else: effect nodes (filter, delay, reverb, LFO, gain) and modules
work in it unchanged (a module whose ports are `signal` goes anywhere sound goes), and one `GraphEditor` edits it in the
**Effects** tab (`PatchTarget { trackId, graph: 'fx' }`; the other graphs are `'patch'` and `'notes'`).

* **Nodes.** `trackIn` (a source that copies the track's own signal, read from `ProcessContext.input`) and `trackOut`
  (a sink). `NodeDefinition.sink` marks every node whose input is audible (`output`, `trackOut`), and
  `NodeDefinition.insertOnly` keeps the two ends out of the Instrument tab's picker. The Effects picker leaves out
  `note`, `output` and `sampler`, which need a note. A stray one in the wrong graph is harmless: it is silent.
* **Runtime** (`FxGraph`, `core/instrument`). Compiles the whole patch with `compileStage` (one copy of every node, no
  voices) and `process(input, frames)` returns what reaches the sinks. It runs every block, also when the track is idle,
  so reverb and delay tails ring on after the sound stops. `TrackRuntime` runs it on `instrument.render()`;
  `AudioTrackRuntime` renders its clip into a scratch buffer first (the 5 ms declick tail is unchanged) and runs it on
  that. The fader comes after the graph.
* **Commands and diff.** `track/add` carries `fx`; a change of wiring sends `track/setFx` (the graph restarts, and so
  do its tails); a knob or sample change sends the ordinary `track/setParam` / `track/setSample`, which the track applies
  to its patch and its insert graph alike (node ids are unique across a track's graphs), so turning a knob never cuts a
  tail. `diffPatch` in `sync/diff-project.ts` is one function for both slots.
* **Files.** A missing `fx` loads as the default graph (silently), a stored one goes through `sanitizePatch` in the sound
  domain, so a note node or an unknown node in it is dropped with a warning. No format-version bump was needed.
* **UI.** The **Effects** tab sits beside Instrument and Notes and works for every track. A track header shows **fx N**
  (sound effects, opens the Effects tab) and **notes N** (note-graph processing, opens the Notes tab).

## Stereo

Instruments are mono; stereo starts in the insert graph, so a pan, a wide reverb or a ping-pong delay can sit on any
track. Samples keep one or two channels (round 11a, below), and an audio track hands both to its insert graph once its
`Track in` runs in stereo. It reuses the typed-port machinery the note graph introduced.

* **Port kind `stereo`**, beside `signal` and `notes`. A `signal` output may feed a `stereo` input (it is heard in both
  channels); a `stereo` output never feeds a `signal` input, the way back is the explicit *Mono sum* node. Modules inherit
  the kind of their ports like for notes, so a module that ends in a stereo node has a stereo port, and if an inner node is
  switched to or from stereo the wires that stop fitting are pruned (`pruneModuleUses`).
* **Buffers** (`dsp/stereo.ts`). A stereo port is one `Float32Array(256)` laid out planar, left then right (`buffer[i]`,
  `buffer[RIGHT + i]`), so allocation, seeding and summing work unchanged. `compileStage` allocates stereo buffers for
  stereo ports and, for a stereo input with several sources or a mono source, sums into a buffer of its own (a mono
  source is added to both channels). Nodes that make or read stereo index with `RIGHT`; `leftOf`/`rightOf` are views for
  compile time and tests (they allocate, so per-block code does not call them).
* **Every effect without rewriting it.** `PatchNode.stereo` (like `bypassed`): on a node that opts in with
  `NodeDefinition.stereoCapable` (filter, gain, delay) the compiler creates two processors with the same parameters, each
  on one channel of the node's stereo ports, so `describeNode` reports those ports as `stereo`. A port marked `control`
  (`cv`, filter `cutoff`) stays one mono signal that both channels follow, so one LFO moves both. The property editor has a
  **Stereo** switch (the card shows an **L R** tag); `setNodeStereo` flips it and removes the wires that no longer fit.
* **New nodes** (all `insertOnly`, so the instrument picker leaves them out): *Pan* (mono to stereo, constant-power law,
  -3 dB in each channel at the centre), *Width* (mid/side; 0 mono, 1 unchanged, 2 wider), *Stereo reverb* (Freeverb with the
  right tank's delays 23 samples longer, sharing `ReverbTank` with the mono reverb, so a mono source comes out with
  different channels yet a sum that is a clean reverb), *Ping-pong delay* and *Mono sum*.
* **Engine.** `Track out` is a stereo sink and `FxGraph.process` returns a stereo buffer (a mono signal reaching it is
  duplicated, bit for bit, so untouched tracks sound as before); `mixInto` adds the two channels separately. The master
  soft clip and the peak meter were already per channel.
* **Files.** `stereo` is kept only on nodes that can run in stereo, and the wires are rebuilt through `connect`, so a stereo
  output wired into a mono input in a hand-edited file is dropped with a warning. `diffProject` counts the switch as wiring
  (the graph is rebuilt), a knob is still a `setParam`.
* **Decision for later.** A return track starts from a stereo source (its sends are stereo), so it will have its own
  `Return in` node rather than reuse the mono `Track in`; then mono effects on a return need the L R switch, as expected.
* **Stereo samples on audio tracks** (round 11a). `Track in` is `stereoCapable`, so it has the L R switch. A lifted copy
  of a node is told its channel through the optional `DspNode.setChannel(0 | 1)`, which the compiler calls on each copy;
  `Track in` is the first source that needs it (it reads `ProcessContext.input`, not its inputs). In stereo each copy
  reads its half of a planar stereo input, and a mono input is heard in both; in mono it reads a mono input as it is and a
  stereo one as the average. The audio track runtime picks one of **two paths** from `trackInIsStereo(fx)` when its graph
  is built: **mono**, today's math on `monoAt` into a mono scratch, so a track saved before 11a (no `stereo` flag) sounds
  bit for bit as it did; **stereo**, a planar `STEREO_FRAMES` scratch, the read position, fade and level worked out once
  per frame and both channels read there (`readRegion(sample, channel, …)`). The track's tap 0 stays one signal, the
  average of the halves. **New audio tracks start in stereo** (`NEW_AUDIO_TRACK_STEREO` in `core/project`, the one place
  that decides); instrument tracks keep a mono `Track in`. `engine/old-projects.test.ts` holds the bounce hashes of
  both examples and a project with a stereo file, taken before 11a changed the engine.

## Return tracks and sends

A **return track** (`ReturnTrack`, `kind: 'return'`) has automation-only session slots and no note/audio clips: it is a volume and an insert graph that starts at
**Return in**, the sum of what other tracks have sent to it, and ends at Track out. One reverb or delay can serve many
tracks; a return track *is* the bus, so there are no bus names.

* **One primitive.** "Add this much of this signal to return track X" is `SendSink.add` (`dsp/types.ts`), implemented by the
  engine's `AudioBoard` (`engine/audio-board.ts`): one stereo buffer per return track, cleared before every stretch the
  engine mixes (`mixSegment`, so it follows the segments a block is split into), added to by senders, read by the return as its
  input. The **Send** node uses it from anywhere in an insert graph (its `trackId` is the return, `amount` the level, its
  input is stereo so a mono signal is accepted; where it sits is where the signal is taken, before or after other effects).
  The per-track send knobs use the same call, post-fader.
* **Return in is stereo**, so mono effects on a return need the **L R** switch (or use *Stereo reverb*, *Ping-pong delay*,
  *Width*); `Track in` stays mono for instrument and audio tracks. The editor offers `Track in` on every track but returns
  and `Return in` only on returns. **Group in**, where a group bus's graph starts, is the same stereo source under a third
  name, offered only on buses.
* **Order** (`Engine.runOrder`). A track runs after the tracks it takes notes from, and a return after every track or group
  bus that sends to it (`PlayableTrack.sendTargets()`, read from the flattened insert graph). Mixing now follows that order too. A loop
  between returns degrades to the plain order (the later one reads a buffer that is not complete); the editor and files
  prevent it. Sending to a missing return does nothing.
* **Rules** are the same as for notes taken from other tracks. `sendableReturns` offers each Send the other returns that do
  not send back to its track (any track may send to any return; a return may send to a later one); `repairTrackReferences`
  (`persistence/sanitize-track-references.ts`, shared with notes) drops a Send to a missing track, to its own track, to a track
  that is not a return, or that would close a loop; `removeTrack` clears the `trackId` of Sends everywhere (also inside
  modules), and undo restores track and sends together.
* **Commands.** `track/add` has a `return` variant (`fx`, `volume`); a return's effects and volume use the same
  `track/setFx` / `setParam` / `setVolume` as other tracks. Re-pointing a Send changes the graph's structure (its `trackId`
  counts, so it is `track/setFx`); turning its Amount is a `setParam`.
* **UI.** The `+` menu adds a **Return track**; returns are drawn after the clip tracks with a dashed header, hatched empty
  slots and no stop button. The Instrument and Notes tabs say a return has neither; the Effects tab edits its graph. The
  Send node has a picker of return tracks in the property editor (`NodeShape.usesTrack` says which kind of track a node picks: `notes` or `return`).

### Send knobs

`InstrumentTrack.sends` and `AudioTrack.sends` (`SendLevels`: return track id -> 0..1, an absent id means nothing) are the
header knobs, one per existing return track. They are the same primitive as the Send node (`AudioBoard.add`), taken
**post-fader**: the engine adds the track's output times `level * volume` to the return, so turning the track down turns
its sends down, while a Send node (anywhere in the insert graph, so usually pre-fader) is not affected by the fader. The two
add together on the same return. A track's send targets for ordering are its Send nodes and its knobs.

* `setTrackSend` clamps, removes the entry at 0, ignores return tracks as senders and targets that are not returns, and
  returns the same project when nothing changes. `removeTrack` drops the entries for the removed return (undo restores
  them with the track). Dragging a knob merges into one undo step (`send:<track>:<return>`).
* `track/setSends` carries the whole record; `track/add` carries it too. Persistence reads numbers clamped to 0..1
  (`readSends`), and `repairSendLevels` drops entries for tracks that are not return tracks of the file, with a warning.
* The knobs live in the **Mixer** tab (they used to be in the session-view headers, which were too cramped): one per
  return track, labelled with the return's real name, only when return tracks exist and never on a return track; each says
  "post-fader" in its tooltip and is disabled when `mixesAfter` says it would make a loop. The model, the command and
  `setTrackSend` are unchanged.

## The master bus

`Project.master` (`MasterBus { fx: Patch }`) is an insert graph on the final mix: `Master in -> effects -> Track out`, in
stereo, with the same graph editor, modules and persistence as every other graph (`PatchTarget { master: true }`). Nothing
sends to it; it just processes what the tracks and returns have summed.

* **Engine.** `Engine.render` runs the master `FxGraph` on each block of the mix after the tracks are mixed (`processMaster`)
  and before the sample preview (an audition is not part of the mix) and the output soft clip, so a limiter or glue reverb
  sits where it should. It runs every block, so tails ring on after the tracks stop. The engine starts with a pass-through
  graph; `master/setFx` replaces it (restarting its tails), `master/setParam` and `master/setSample` are the knob and picker
  changes. `diffProject` sends `master/setFx` when a project is loaded, then only what changed, by the same function that
  diffs track graphs (`diffPatch('master', ...)`).
* **Nodes.** `Master in` is the same stereo source as `Return in` and `Group in` (one implementation, three names). The master's picker
  has `Master in`, not `Track in`, `Return in` or `Send` (the returns are mixed before the master, so there is nothing to
  send to).
* **Project.** The default graph comes with every new project, files without one load with it silently, and a stored one
  goes through `sanitizePatch`. Modules, `moduleUsage` ("Master" is listed as a user), `removeSample` and `removeTrack`
  treat it like any track's graph.
* **UI.** A **Master** strip ends the session grid (select it to open its graph in the Effects tab; the tab then edits
  `GraphEditor owner="master"`); `useSelectionStore.master` says it is selected. The Mixer tab ends with a master strip too.
* **Master volume.** `MasterBus.volume` (0..1, absent = 1) is a gain applied in `processMaster` right after the master
  graph and before the soft clip, so it scales the final mix exactly. The sample preview skips it, like it skips the graph
  (an audition is not part of the mix). `master/setVolume`; `diffProject` sends it on load and on change. There is still no
  limiter: the soft clip is the only one.
* **The metronome** (`core/engine/metronome.ts`) is mixed in after each block's `processMaster`, beside the preview and
  before the soft clip, so effects and the master fader never touch it. While the transport plays, in either mode, it
  starts a click on the first sample at or after each whole beat (a click running past a block goes on into the next):
  a 25 ms sine with a 1 ms attack and an exponential decay, 1500 Hz on the first beat of a bar (4/4) and 1000 Hz on the
  others. A loop jump makes the next click the loop start's beat. `transport/metronome { on, level }` (level in dB, −40
  to 0, default −12) sets it; it starts off and is not part of the project, so `diffProject` never sends it: the
  browser preference is sent by `app/project-sync`, and a bounce, which builds its own engine from the project, never
  clicks.
* **The count-in** (`transport/countIn { bars, then }`) clicks through the same metronome, at its level, **even while it
  is off**: the count-in's own beats, −4 × bars up to −1, the bar's first beat higher. While it runs the transport is
  stopped, so clips are silent and live notes sound; at its end the block is split and `then` (▶, a clip or scene
  launch, or an arrangement play) starts the transport on that exact frame. A bounce never sends it.

## Mixer

The **Mixer** tab (`ui/mixer/`, view `mixer`) is a row of vertical channel strips: every shown track in the order of
`trackRows` (clip tracks group by group, then returns), then the master. Groups are bands over their members' strips; a
bus has a strip of its own, first under its band, and a collapsed group is one strip, its bus's or a narrow one with M
and S for a folder (see "Tracks and groups"). An expanded folder's band has its M and S. A strip has the track's name (select), an fx badge (opens the Effects tab),
pan, one send knob per return, **M**ute, **S**olo, the fader and a level meter. The session grid keeps its header volume
slider (the same `track.volume`) and gains no other control; its header only strikes through the name of a muted track
(muted by its own flag or through a group).

* **Strips share their parts.** `ChannelStrip.tsx` exports `PanControl`, `SendKnobs`, `FaderRow`, `MuteSolo` and
  `OutputLine`, fed by a small `StripOwner` (`owner`, `name`, `volume`, `pan`, `sends?`), so a track's strip and a
  bus's (`BusStrip.tsx`) draw the same controls. Under the name, a bus shows where it sums into (*→ Drums*, *→
  Master*), and a member does when that isn't the master. A strip muted or soloed only through a group lights its M or
  S halfway (`data-through-group`), so the cause shows on the group.

* **Model.** `TrackBase` gets optional `pan` (-1..1), `muted` and `soloed`, and `MasterBus` an optional `volume`. They are
  saved only when they differ from the default (centre, false, false, 1): `setTrackPan` & co. delete the key when the value
  returns to the default, and the sanitizer writes none for a default, so old files load identically and the format version
  did not change. Edits clamp and return the same project when nothing changes (no empty undo step). Pan drags merge into one
  undo step (`pan:<track>`), so do master-fader drags (`master-volume`); mute and solo are single steps.
* **Channel strip** (`engine/channel-strip.ts`). Every `PlayableTrack` has a `strip` holding fader, pan, mute, solo, the
  engine-decided `audible` flag, the send gate and the peak. A runtime runs its insert graph and writes its taps as before,
  then hands the stereo signal to `strip.mixInto`, which scales each channel by `volume` and the pan gains and adds them to the
  buses. **Pan law**: the same cos/sin curve as the *Pan* node, times sqrt(2), so the **centre passes at unity** (the *Pan*
  node itself puts a mono source at -3 dB in each channel; a track's default pan must leave old projects sounding the same,
  so the strip is normalised and pan 0 is exactly 1/1). Hard left or right is +3 dB in one channel, and the power of a mono
  source stays constant along the way. Pan is after the insert graph, next to the fader; **sends stay post-fader and are not
  panned** (they carry the stereo signal to the return as before).
* **Mute** silences the track everywhere it is heard: its output *and* its sends (both the knobs and the Send nodes in its
  graph, through a per-track `SendGate`). Its insert graph keeps running, so tails ring on, and its taps are still written,
  so Track audio nodes that read it keep working. Only what it adds to the output is silenced.
* **Solo** is "solo in place". When any channel is soloed, a channel is heard only if it is soloed, or it is a **bus fed
  by a heard channel**, or a **return fed by a heard channel** (so a soloed track keeps its group's bus and its reverb,
  however deep: the set grows until nothing changes). A muted return or bus stays muted.
* **Through groups.** The rules apply to **effective** flags (`mixRouting`): a track or a bus is muted when it or any
  enclosing group is, soloed likewise. So muting a group, folder or bus, silences its members everywhere they are heard,
  sends included, and soloing a group solos its members and its bus. Rules, in full, for tracks, returns and buses:
  * no solo anywhere: heard = not muted;
  * under solo, a soloed channel is heard; a bus fed by a heard channel is heard unless muted; a return fed by a heard
    channel through an open send is heard unless muted;
  * a **soloed return** is heard, and channels that send to it keep sending to it even though they are not heard
    themselves (solo a reverb to hear only the wet signal). A bus that sends to it gets nothing from members that are
    not heard, so its share of the wet signal goes;
  * a channel that is both muted and soloed is heard (solo wins); a soloed member of a muted bus is then heard only
    through its own sends;
  * a send from X to return R is open when X is soloed, or X is not muted and (X is heard or R is soloed). A member's
    output into its bus is not a send: it follows whether the member is heard.
  `mixState(channels)` (`engine/mix-state.ts`) is these rules as a pure function, with table tests;
  `Engine.updateMixState` calls it when a mute, solo, output, track, send or graph changes (`mixStateStale`), never per
  sample. The result is each strip's `audible` and its set of blocked send targets.
* **Buses in the engine.** A bus is a channel in the engine's track map, keyed by its group id: `GroupBusRuntime`, which
  shares the return's input, graph and taps code (`StereoBus`) and adds real send knobs. Each channel has an output (a
  bus id or none, in the engine's `routes`); `mixSegment` hands it its destination: the master's arrays at the stretch's
  offset, or its bus's slot on a second `AudioBoard` (`outputs`, views made at `sync` by `channels(id)`) at offset 0. A
  channel whose bus isn't there mixes into the master. The mix order puts a bus after the channels that sum into it.
* **Commands.** `track/setPan`, `track/setMute`, `track/setSolo`, `master/setVolume`, small and separate like
  `track/setVolume`; `track/add` carries the three track fields too (so a project loaded with a muted track starts muted),
  and an `output`. A bus is `track/add` kind `group`, then the same `track/*` commands with the group id;
  `track/setOutput` moves a channel to another bus. `diffProject` sends mute, solo and output through `mixRouting` of
  both projects, for every channel: a group's mute is one `track/setMute` per member, a track moved into a bus group one
  `track/setOutput`. `diffTrack` compares pan with its default, so a field that appears or disappears is a command only
  if the value changed.
* **Meters.** `EngineStatus.peaks` is a record track or bus id -> the loudest sample the channel *added to its output* (the
  master, or its bus) since the previous status, after fader, pan, mute and solo (zero for a track that is not heard), read-and-reset like `peak`. The
  master strip shows `peak`. The bars are drawn by `LevelBar` from the status store (~30 Hz): the engine reports raw peaks and
  the bar falls with a fixed factor per update, on a dB scale (the raw value is in `data-peak`).
* **Fader law.** The stored volume is linear 0..1, as before; the control is linear too (no dB taper yet).
* **Files.** `sanitizeTrack` reads `pan` (finite, clamped), `muted` and `soloed` (only a real `true` counts) and the
  master's `volume` (clamped, anything else is 1).

## Track audio (taking another track's sound)

The **Track audio** node is the audio mirror of *Track notes*: a stereo source in an insert graph that plays another track's
sound, `Take` before or after that track's own effects (both before its fader, so a track turned all the way down can still
be used). It makes parallel chains possible (process a copy of a drum loop differently on another track) and modulation
(through *Mono sum* into a Gain's CV the other track scales this one). The **Envelope follower** node turns a signal's
level into a control, and the **Compressor** node ducks one sound under another (its `Sidechain` input, with a gain-reduction
out for metering).

* **Engine** (`engine/audio-taps.ts`). Each track writes its sound before and after its insert graph to `AudioTaps`, one stereo
  buffer each, only for tracks someone reads; Track audio nodes read it through `ProcessContext.taps`. Like the sends board
  it is cleared before every stretch the engine mixes (`mixSegment`), which is why the master graph, which runs on the whole
  block, has no Track audio node. A return track can be taken too (its `before` is its input, its `after` its output).
* **Two orders.** Notes are passed on before any sound is mixed, so the engine keeps two orders: the schedule order (a track after
  the tracks it takes notes from) and the mix order (a return after the tracks that send to it, a track after the tracks it
  takes audio from). A notes loop and a sound dependency in opposite directions are therefore not a loop.
* **Rules** (`project/mix-order.ts`). `mixDependencies(track)` = the tracks it takes audio from, plus for a return the tracks that
  send to it (Send nodes and send knobs). `audioSourceTracks` offers each node every other track that is not mixed after its
  own, `sendableReturns` every return that is not mixed before the sender, and `setTrackSend` refuses a knob that would
  loop (the header disables it). `repairTrackReferences` applies the same test to files (a pointer to a missing track, to its
  own track or that closes a loop is dropped, one at a time, with a warning), and `repairSendLevels` to the knobs.
  `removeTrack` clears the inputs that took from the removed track, also inside modules.
* **UI.** The node has a track picker (`NodeShape.usesTrack: 'audio'`) and a Take choice.
