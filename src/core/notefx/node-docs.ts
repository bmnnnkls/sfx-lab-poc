import type { NodeDocs } from '../dsp'

/** What every note node, port and parameter is for, in plain sentences. */
export const noteNodeDocs: Readonly<Record<string, NodeDocs>> = {
  clipNotes: {
    category: 'Sources',
    description: 'The notes of this track\'s own clips, as they are launched.',
    keywords: ['clip', 'midi', 'start', 'source', 'piano roll'],
    outputs: { out: 'The notes of the playing clip.' },
  },
  trackNotes: {
    category: 'Sources',
    description: 'The notes of another track, to play along with or to answer.',
    keywords: ['other track', 'follow', 'source', 'midi'],
    outputs: { out: 'The other track\'s notes.' },
    params: { tap: 'Take its clip notes as they are, or what comes out of its own note graph.' },
  },
  scaleLock: {
    category: 'Effects',
    description: 'Moves every note to the nearest note of a scale, so nothing sounds wrong.',
    keywords: ['key', 'scale', 'harmony', 'quantize', 'snap'],
    inputs: { in: 'The notes to move into the scale.' },
    outputs: { out: 'The notes, inside the scale.' },
    params: { root: 'The first note of the scale.', scale: 'The kind of scale.' },
  },
  transpose: {
    category: 'Effects',
    description: 'Moves every note up or down by a number of semitones.',
    keywords: ['pitch', 'shift', 'octave', 'semitone'],
    inputs: { in: 'The notes to move.' },
    outputs: { out: 'The moved notes.' },
    params: { semitones: 'How far to move: 12 is one octave up.' },
  },
  chord: {
    category: 'Effects',
    description: 'Turns each note into a chord.',
    keywords: ['harmony', 'triad', 'stack', 'intervals'],
    inputs: { in: 'The notes to build chords on.' },
    outputs: { out: 'The chords.' },
    params: { chord: 'The kind of chord built on each note.' },
  },
  velocity: {
    category: 'Effects',
    description: 'Makes notes harder or softer: scales and shifts how hard each one is hit.',
    keywords: ['dynamics', 'loudness', 'volume', 'compress', 'expand'],
    inputs: { in: 'The notes to change.' },
    outputs: { out: 'The notes with their new velocities.' },
    params: { scale: 'Multiplies the velocity: 1 leaves it, 0 silences, 2 doubles.', offset: 'Added to the velocity after scaling.' },
  },
  arpeggiator: {
    category: 'Effects',
    description: 'Plays the notes you hold one after another, as a pattern, instead of together.',
    keywords: ['arp', 'pattern', 'sequence', 'broken chord'],
    inputs: { in: 'The held notes to play in turn.' },
    outputs: { out: 'The arpeggio.' },
    params: {
      rate: 'How fast the notes follow each other, as a note length.',
      pattern: 'The order the notes are played in.',
      octaves: 'How many octaves the pattern climbs through.',
      gate: 'How long each note lasts, as a fraction of its step.',
    },
  },
  echo: {
    category: 'Effects',
    description: 'Repeats each note a few times, softer each time.',
    keywords: ['delay', 'repeat', 'feedback'],
    inputs: { in: 'The notes to repeat.' },
    outputs: { out: 'The notes and their repeats.' },
    params: {
      time: 'The gap between repeats, as a note length.',
      repeats: 'How many repeats follow each note.',
      decay: 'How much softer each repeat is than the one before.',
    },
  },
  rangeSplit: {
    category: 'Routing',
    description: 'Sends notes one way if they fall inside a pitch and velocity range, and another way if not.',
    keywords: ['split', 'zone', 'layer', 'keyboard split', 'filter'],
    inputs: { in: 'The notes to sort.' },
    outputs: { inside: 'Notes inside the range.', outside: 'Notes outside the range.' },
    params: {
      lowPitch: 'The lowest note in the range.',
      highPitch: 'The highest note in the range.',
      minVelocity: 'The softest note in the range.',
      maxVelocity: 'The hardest note in the range.',
    },
  },
  noteOut: {
    category: 'Routing',
    description: 'The end of the note graph: the notes wired here are what the instrument plays.',
    keywords: ['output', 'instrument', 'end', 'sink'],
    inputs: { in: 'The notes that reach the instrument.' },
  },
}
