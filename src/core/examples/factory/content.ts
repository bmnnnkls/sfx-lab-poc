/**
 * What the Factory holds, one row per item: where it goes, what it is called, where it comes from, and a line for the
 * details. Content grows by adding rows; the code that builds the catalog doesn't change.
 */

/** The projects the Factory takes its sounds from. */
export type FactorySourceProject = 'low-light' | 'glass-rain' | 'starters'

export type FactorySource =
  /** A graph of an owner (a track's id, or the master): its instrument (with its notes), effects or notes. */
  | { readonly from: FactorySourceProject; readonly owner: string; readonly domain: 'patch' | 'fx' | 'notes'; readonly plainNotes?: true }
  /** A session clip: the clip of `track` in `scene` (from 0). */
  | { readonly from: FactorySourceProject; readonly track: string; readonly scene: number }

export interface FactoryEntry {
  /** The folder path, from the top: `['Effects', 'Returns']`. */
  readonly folder: readonly string[]
  readonly name: string
  /** The last part of its stable id, when its name isn't unique in its folder. */
  readonly key?: string
  readonly source: FactorySource
  /** One or two short sentences for the details. */
  readonly note: string
}

const LL = 'low-light', GR = 'glass-rain', ST = 'starters'
const patchOf = (from: FactorySourceProject, owner: string, extra: { plainNotes?: true } = {}): FactorySource => ({ from, owner, domain: 'patch', ...extra })
const fxOf = (from: FactorySourceProject, owner: string): FactorySource => ({ from, owner, domain: 'fx' })
const clipOf = (from: FactorySourceProject, track: string, scene: number): FactorySource => ({ from, track, scene })

/** Low Light's scenes, from 0. */
const GROOVE = 1, HOOK = 3, DROP = 6
/** Glass Rain's. */
const FOG = 0, STORM = 4

export const FACTORY_CONTENT: readonly FactoryEntry[] = [
  // Drums
  { folder: ['Drums'], name: 'Kick', source: patchOf(LL, 'kick'), note: "Low Light's kick: an impulse ringing a resonant low-pass whose cutoff dives, the same on every hit." },
  { folder: ['Drums'], name: 'Clap', source: patchOf(LL, 'clap'), note: "Low Light's clap: a band of mid noise. Three quick notes make it smear like several hands." },
  { folder: ['Drums'], name: 'Hat', source: patchOf(LL, 'hat'), note: "Low Light's closed hat: a tick of high noise, short enough for every sixteenth." },
  { folder: ['Drums'], name: 'Open hat', source: patchOf(LL, 'open'), note: "Low Light's open hat: the same noise left to ring, a little darker." },
  { folder: ['Drums'], name: 'Shaker', source: patchOf(LL, 'shaker'), note: "Low Light's shaker: a band of mid-high noise, softer and longer than the hat." },
  { folder: ['Drums'], name: 'Knocks', source: patchOf(LL, 'tok'), note: "Low Light's knocks: a struck sine that drops in pitch, plus an overtone. It plays the note's pitch." },
  { folder: ['Drums'], name: 'Crash', source: patchOf(LL, 'crash'), note: "Low Light's crash: the open hat's noise left to ring for a second." },
  { folder: ['Drums'], name: 'Heart', source: patchOf(GR, 'heart'), note: "Glass Rain's heartbeat: a soft, long kick made of a filter ping." },
  // Bass
  { folder: ['Bass'], name: 'Bass', source: patchOf(LL, 'bass'), note: "Low Light's bass: a sine for weight and a plucked, soft-clipped saw for bite. Without its sidechain duck." },
  { folder: ['Bass'], name: 'Sub', source: patchOf(GR, 'sub'), note: "Glass Rain's sub: a plain, round low end under the pad." },
  // Keys and synths
  { folder: ['Keys and synths'], name: 'Organ stab', source: patchOf(LL, 'stab'), note: "Low Light's stab: a five-drawbar organ through a snapping low-pass, with its chord notes: one key plays a minor seventh in A minor." },
  { folder: ['Keys and synths'], name: 'Pluck', source: patchOf(LL, 'arp', { plainNotes: true }), note: "Low Light's arp voice without its arpeggiator: two detuned oscillators through a plucked, resonant low-pass." },
  { folder: ['Keys and synths'], name: 'Pad', source: patchOf(GR, 'pad'), note: "Glass Rain's pad: detuned saws and a triangle through a low-pass that breathes with the tempo." },
  // Generative
  { folder: ['Generative'], name: 'Bells', source: patchOf(GR, 'bells'), note: 'A melody that composes itself: hold a note and a wandering line of FM bells plays in the scale. Density and the pad shape it.' },
  { folder: ['Generative'], name: 'Drops', source: patchOf(GR, 'drops'), note: 'Rain as notes: hold a note and drops of water fall at random on the scale, each rising as it sounds.' },
  { folder: ['Generative'], name: 'Ticks', source: patchOf(GR, 'ticks'), note: 'A hi-hat that plays itself: hold a note for sixteenths that a die thins out, each with its own brightness.' },
  // Textures
  { folder: ['Textures'], name: 'Drone', source: patchOf(LL, 'drone'), note: "Low Light's drone: detuned saws and a sub through a dark filter that a slow wander opens. Without its duck." },
  { folder: ['Textures'], name: 'Riser', source: patchOf(LL, 'riser'), note: "Low Light's riser: noise swept up a high-pass over a climbing sine. Hold one long note." },
  { folder: ['Textures'], name: 'Dust', source: patchOf(LL, 'dust'), note: "Low Light's dust: random clicks like a worn record, so quiet it is felt more than heard." },
  { folder: ['Textures'], name: 'Rain', source: patchOf(GR, 'rain'), note: "Glass Rain's rain: fine patter and bigger splashes from two random clocks." },
  { folder: ['Textures'], name: 'Wind', source: patchOf(GR, 'wind'), note: "Glass Rain's wind: brown noise through a band-pass that a slow wander sweeps up and down." },
  // Effects
  { folder: ['Effects', 'Tracks'], name: 'Wander', source: fxOf(GR, 'bells'), note: 'A pan that drifts about on a slow random wander. Roam sets how far, Wander speed how fast.' },
  { folder: ['Effects', 'Tracks'], name: 'Low cut', source: fxOf(ST, 'low-cut'), note: "A high-pass to clear the low end out of a track that doesn't need it." },
  { folder: ['Effects', 'Tracks'], name: 'Widener', source: fxOf(ST, 'widener'), note: 'Mid/side width: 0 is mono, 1 as it is, 2 twice as wide.' },
  { folder: ['Effects', 'Returns'], name: 'Room', source: fxOf(LL, 'room'), note: "Low Light's room: a short stereo reverb after a low cut." },
  { folder: ['Effects', 'Returns'], name: 'Hall', key: 'hall-low-light', source: fxOf(LL, 'hall'), note: "Low Light's hall: a long, darkened stereo reverb." },
  { folder: ['Effects', 'Returns'], name: 'Hall', key: 'hall-glass-rain', source: fxOf(GR, 'hall'), note: "Glass Rain's hall: a very large reverb, low cut and darkened, for washes." },
  { folder: ['Effects', 'Returns'], name: 'Echo', source: fxOf(GR, 'echo'), note: "Glass Rain's echo: a dotted-eighth ping-pong, darkened, with a low cut." },
  { folder: ['Effects', 'Master'], name: 'DJ filter', source: fxOf(LL, 'master'), note: "Low Light's master: one slider for a low-pass to the left and a high-pass to the right, with Width and a Cut button." },
  { folder: ['Effects', 'Master'], name: 'Haze and Hush', source: fxOf(GR, 'master'), note: "Glass Rain's master: a haze low-pass, width, and Hush, which fades everything down and back." },
  // Note effects
  { folder: ['Note effects'], name: 'Minor seventh in A minor', source: { from: LL, owner: 'stab', domain: 'notes' }, note: 'Each note becomes a minor seventh chord, kept in A minor.' },
  { folder: ['Note effects'], name: 'Sixteenth arp', source: { from: LL, owner: 'arp', domain: 'notes' }, note: 'A minor seventh chord in A minor, played as sixteenths, a little softer.' },
  // Clips
  { folder: ['Clips', 'Low Light'], name: 'Groove kick', source: clipOf(LL, 'kick', GROOVE), note: 'Four on the floor, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Groove clap', source: clipOf(LL, 'clap', GROOVE), note: 'A flammed backbeat, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Groove hats', source: clipOf(LL, 'hat', GROOVE), note: 'Swung sixteenth hats with ghost notes, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Groove bass', source: clipOf(LL, 'bass', GROOVE), note: 'An off-beat bass roll in A minor, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Hook stab', source: clipOf(LL, 'stab', HOOK), note: 'The off-beat organ stab, four bars: one note per stab, the chord comes from the note effect.' },
  { folder: ['Clips', 'Low Light'], name: 'Drop kick', source: clipOf(LL, 'kick', DROP), note: 'Four on the floor, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Drop clap', source: clipOf(LL, 'clap', DROP), note: 'The backbeat with pickups, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Drop hats', source: clipOf(LL, 'hat', DROP), note: 'Busy sixteenth hats, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Drop bass', source: clipOf(LL, 'bass', DROP), note: 'A busier bass roll, four bars.' },
  { folder: ['Clips', 'Low Light'], name: 'Drop stab', source: clipOf(LL, 'stab', DROP), note: 'The off-beat organ stab, four bars.' },
  { folder: ['Clips', 'Glass Rain'], name: 'Fog chords', source: clipOf(GR, 'pad', FOG), note: 'Soft, slow pad chords.' },
  { folder: ['Clips', 'Glass Rain'], name: 'Storm chords', source: clipOf(GR, 'pad', STORM), note: 'Full pad chords for the loud part.' },
  // Starters
  { folder: ['Starters'], name: 'Basic synth', source: patchOf(ST, 'basic-synth'), note: 'A saw through a low-pass that an envelope opens: the synth to start from.' },
  { folder: ['Starters'], name: 'FM bell', source: patchOf(ST, 'fm-bell'), note: 'Two-operator FM: Ratio picks the bell, Bright how hard it strikes.' },
  { folder: ['Starters'], name: 'Noise sweep', source: patchOf(ST, 'noise-sweep'), note: 'Noise through a resonant band-pass that sweeps up while the note is held.' },
  { folder: ['Starters'], name: 'Sine sub', source: patchOf(ST, 'sine-sub'), note: 'A sine with a touch of its octave, so it still shows on small speakers.' },
  { folder: ['Starters'], name: 'Synced delay', source: fxOf(ST, 'synced-delay'), note: 'A quarter-note delay locked to the tempo, darkened, mixed in.' },
]
