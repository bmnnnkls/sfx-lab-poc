import type { Snapshot, SampleBinding, AssetRevision, ProjectPreset } from '../preset'
import type { AutomationLane } from '../automation'
import type { MidiMapping, MidiTrackInput } from '../midi'
import type { ControlValue } from '../control'
import type { ModuleDefinition, Patch } from '../patch'
import type { SampleInfo } from '../sample'
import type { ArrangementClip } from './arrangement-clip'

export interface Note {
  /** Stable identity, so selections and held notes survive edits and undo. */
  readonly id: string
  /** MIDI pitch, 60 = middle C. */
  readonly pitch: number
  /** Start within the clip, in beats. */
  readonly start: number
  readonly duration: number
  /** 0..1 */
  readonly velocity: number
}

export interface Clip {
  readonly automation?: readonly AutomationLane[]
  readonly id: string
  readonly name: string
  readonly lengthBeats: number
  readonly notes: readonly Note[]
}

/**
 * How an audio clip relates to the project tempo.
 * - `repitch`: the clip spans `lengthBeats` beats and is sped up or slowed down to fit, so it stays locked to
 *   the grid at any tempo. Pitch follows speed (like Ableton's Re-Pitch mode).
 * - `off`: plays at its original speed, unaffected by tempo.
 */
export type WarpMode = 'repitch' | 'off'

/** A library sample placed in a slot of an audio track. */
export interface AudioClip {
  readonly automation?: readonly AutomationLane[]
  readonly id: string
  readonly name: string
  /** Which library sample to play. */
  readonly sampleId: string
  /** Length of one pass through the sample, in beats. Sets the loop length and, in `repitch` mode, the speed. */
  readonly lengthBeats: number
  readonly loop: boolean
  readonly warp: WarpMode
  /** 0..2, 1 = unchanged. */
  readonly gain: number
  /** Where the played region starts, as a fraction (0..1) of the whole sample. */
  readonly start: number
  /** Where it ends (> `start`, <= 1). In re-pitch mode this region is what fits `lengthBeats`; when looping it is what repeats. */
  readonly end: number
  /** Fade-in at the start of each pass, in seconds of the sample's own time (so it is the same at any tempo). */
  readonly fadeIn: number
  /** Fade-out at the end of each pass, likewise. */
  readonly fadeOut: number
}

interface TrackBase {
  readonly id: string
  readonly name: string
  readonly volume: number
  /**
   * Where the track sits between the speakers, -1 (left) .. 1 (right); absent = 0, the centre. Applied after the
   * insert graph, next to the fader.
   */
  readonly pan?: number
  /** Silences the track everywhere it is heard, its sends included; absent = false. Its effects keep running. */
  readonly muted?: boolean
  /** Silences every track that is not soloed (see docs/architecture/mixing-and-routing.md, "Mixer"); absent = false. */
  readonly soloed?: boolean
  /** The group the track is directly in (see `TrackGroup`); absent = the top level. Never set on a return. */
  readonly groupId?: string
  /** Left out of the session grid, the arrangement and the mixer; it still plays. Absent = shown. Not an undo step. */
  readonly hidden?: boolean
  /**
   * The insert graph after the track's own sound and before its fader: `Track in` -> effects -> `Track out`.
   * A fresh track has just those two, wired together (the sound passes through unchanged).
   */
  readonly fx: Patch
}

/**
 * What a track sends to each return track with its send knobs: return track id -> level (0..1, absent = nothing). The
 * knob takes the sound after the insert graph and the fader (post-fader); a Send node in the insert graph takes it
 * wherever it sits, and the two add together.
 */
export type SendLevels = Readonly<Record<string, number>>

/** Plays MIDI clips through a patch (a synth or sampler). */
export interface InstrumentTrack extends TrackBase {
  readonly kind: 'instrument'
  readonly sends: SendLevels
  /** Maximum simultaneous notes; further notes steal the oldest voice. */
  readonly voices: number
  readonly patch: Patch
  /**
   * The note graph between the clips and the instrument: nodes (effects, splits, notes from other tracks) wired
   * from `clipNotes` to `noteOut`. A fresh track has just those two, wired together.
   */
  readonly noteGraph: Patch
  /** One slot per scene (row) of the session grid; null = empty slot. */
  readonly clips: readonly (Clip | null)[]
  /**
   * Where live MIDI notes come from: absent, the track follows the selection (it plays while it is the selected or the
   * pinned instrument); set, it always listens to that input and channel (`{}` is any input, any channel), whatever is
   * selected.
   */
  readonly midiInput?: MidiTrackInput
  /** How far the pitch wheel bends, in whole semitones either way (0 to 24); absent is 2. */
  readonly bendRange?: number
}

/** Plays audio clips (library samples) straight to the mix. */
export interface AudioTrack extends TrackBase {
  readonly kind: 'audio'
  readonly sends: SendLevels
  readonly clips: readonly (AudioClip | null)[]
}

/** Dedicated return/master automation-only session cell; null in the owner array means stop. */
export interface AutomationSlot {
  readonly id: string
  readonly name: string
  readonly lengthBeats: number
  readonly automation?: readonly AutomationLane[]
}

/**
 * A return (send/aux) track: automation-only slots, no note/audio clips. Its insert graph starts at `Return in`, the sum of what other tracks send to it
 * (with Send nodes), so one reverb or delay can serve several tracks. It is mixed like any track, after the tracks that
 * send to it.
 */
export interface ReturnTrack extends TrackBase {
  readonly automationSlots?: readonly (AutomationSlot | null)[]
  readonly kind: 'return'
}

export type Track = InstrumentTrack | AudioTrack | ReturnTrack

/**
 * The master bus: an insert graph on the final mix of all tracks, after they are summed and before the output limiter,
 * `Master in` -> effects -> `Track out`, in stereo. Nothing sends to it; it just processes the mix.
 */
export interface MasterBus {
  readonly automationSlots?: readonly (AutomationSlot | null)[]
  readonly fx: Patch
  /** 0..1 gain on the whole mix, after the master graph and before the output soft clip; absent = 1. */
  readonly volume?: number
}

/** What a group is drawn in: a name, resolved by the views through a CSS variable (`--group-red`). */
export type GroupColour = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink'

/**
 * A folder of instrument and audio tracks, optionally a summing bus. Its tracks, nested groups' included,
 * sit together in `Project.tracks`, and it is drawn where its first track is, so a group always has a track.
 */
export interface TrackGroup {
  /** Never the id of a track: a group becomes a control owner with its bus. */
  readonly id: string
  readonly name: string
  readonly colour: GroupColour
  /** Its members are folded away in every view; absent = expanded. Not an undo step. */
  readonly collapsed?: boolean
  /** The group it is nested in; absent = the top level. */
  readonly parentId?: string
  /** Silences its members, nested groups' included, everywhere they are heard; absent = false. */
  readonly muted?: boolean
  /** Solos its members and its bus (see docs/architecture/mixing-and-routing.md, "Mixer"); absent = false. */
  readonly soloed?: boolean
  /** Sums its members after their faders, instead of sending them to the master; absent = a folder. */
  readonly bus?: GroupBus
}

/**
 * What a group that sums its tracks has after them, as a track has after its instrument. Its output is the nearest
 * enclosing group with a bus, or the master.
 */
export interface GroupBus {
  /** 0..1, as a track's. */
  readonly volume: number
  /** -1..1; absent = the centre. */
  readonly pan?: number
  /** `Group in` -> effects -> `Track out`, in stereo. */
  readonly fx: Patch
  /** Post-fader, as a track's knobs. */
  readonly sends: SendLevels
}

/** The saveable document. Everything the user authors lives here. */
/** One owner's automation lanes on the arrangement's timeline. */
export interface TimelineLanes {
  readonly owner: import('../control').ControlOwner
  readonly lanes: readonly AutomationLane[]
  /** The lanes are shown under the owner's row: a view field, saved and not undone. */
  readonly open?: boolean
}

export interface Project {
  readonly libraryOrigins?: readonly import('../library').LibraryOrigin[]
  readonly snapshots?: readonly Snapshot[]
  readonly sampleBindings?: readonly SampleBinding[]
  readonly assetRevisions?: readonly AssetRevision[]
  readonly presets?: readonly ProjectPreset[]
  readonly midiMappings?: readonly MidiMapping[]
  /** Values of controls inside a particular nested module use; shared definitions stay unchanged. */
  readonly controlValues?: readonly ControlValue[]
  readonly name: string
  readonly tempo: number
  readonly sceneCount: number
  /**
   * What each scene is called ("Intro", "Drop"), shown under its launch button; position `i` names scene `i`, an empty string or a
   * missing entry leaves it unnamed. Absent in a project nobody has named scenes in.
   */
  readonly sceneNames?: readonly string[]
  /** The sample library: audio used (or usable) by this project. Bytes are stored separately. */
  readonly samples: readonly SampleInfo[]
  /** Reusable sub-patches (of sound or of notes). Patches use them by id, so editing one changes every use. */
  readonly modules: readonly ModuleDefinition[]
  readonly master: MasterBus
  /** The order of everything: clip tracks in a group sit together. Returns are drawn after the clip tracks. */
  readonly tracks: readonly Track[]
  /** Folders of tracks; absent in a project without groups. Their own order means nothing. */
  readonly groups?: readonly TrackGroup[]
  /** The front panels the Pinned view shows, top to bottom; absent when none are. A view field, as a group's collapse. */
  readonly pins?: readonly import('./pins').PanelPin[]
  /**
   * The arrangement: copies of session clips placed on a timeline, per track. Absent in projects nobody has
   * arranged in (old files), so no format-version bump was needed.
   */
  readonly arrangement?: readonly ArrangementClip[]
  /** Named places on the arrangement's timeline, sorted by beat; absent when there are none. */
  readonly arrangementMarkers?: readonly import('./arrangement-marks').ArrangementMarker[]
  /** The loop brace on the arrangement's timeline; absent when none is drawn. */
  readonly arrangementLoop?: import('./arrangement-marks').ArrangementLoop
  /**
   * Automation lanes on the arrangement's timeline, in beats from the song's start: one entry per owner (a track, a
   * return, the master or a group with a bus), absent when there are none. Since format v14.
   */
  readonly arrangementAutomation?: readonly TimelineLanes[]
}
