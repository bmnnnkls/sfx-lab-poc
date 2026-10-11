import type { AudioTrack, InstrumentTrack, ReturnTrack, Track } from './types'

export const isInstrumentTrack = (track: Track): track is InstrumentTrack => track.kind === 'instrument'
export const isAudioTrack = (track: Track): track is AudioTrack => track.kind === 'audio'
export const isReturnTrack = (track: Track): track is ReturnTrack => track.kind === 'return'
