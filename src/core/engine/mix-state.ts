/** What the mute and solo rules need to know about one channel the engine mixes: a track, a return or a bus. */
export interface MixChannel {
  readonly id: string
  readonly kind: 'track' | 'return' | 'bus'
  /** Effective flags: its own, or any enclosing group's (`mixRouting`). */
  readonly muted: boolean
  readonly soloed: boolean
  /** The bus it sums into, or null for the master. */
  readonly output: string | null
  /** The return tracks it sends to, with Send nodes or send knobs. */
  readonly sends: readonly string[]
}

export interface MixState {
  /** The channels heard in their output. */
  readonly heard: ReadonlySet<string>
  /** For each channel, the return tracks it must not send to right now. */
  readonly blocked: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * Works out which channels are heard and which sends are open, from effective mute and solo (rules in
 * docs/architecture/mixing-and-routing.md, "Mixer"). With no solo, a channel is heard unless muted. Under solo, a soloed channel is heard; then, until nothing
 * changes, a bus fed by a heard channel is heard unless muted, and so is a return fed by a heard channel through an open
 * send. A send is open when its sender is soloed, or is not muted and either heard or sending to a soloed return. A
 * channel's output into its bus is not a send: it follows whether the channel is heard.
 */
export const mixState = (channels: readonly MixChannel[]): MixState => {
  const byId = new Map(channels.map((channel) => [channel.id, channel]))
  const soloActive = channels.some((channel) => channel.soloed)
  const heard = new Set(channels.flatMap((channel) => ((soloActive ? channel.soloed : !channel.muted) ? [channel.id] : [])))
  const open = (from: MixChannel, to: MixChannel): boolean => from.soloed || (!from.muted && (heard.has(from.id) || to.soloed))

  if (soloActive) {
    let grew = true
    while (grew) {
      grew = false
      for (const from of channels) {
        if (!heard.has(from.id)) continue
        const bus = from.output === null ? undefined : byId.get(from.output)
        if (bus?.kind === 'bus' && !heard.has(bus.id) && !bus.muted) {
          heard.add(bus.id)
          grew = true
        }
        for (const targetId of from.sends) {
          const to = byId.get(targetId)
          if (to?.kind === 'return' && !heard.has(to.id) && !to.muted && open(from, to)) {
            heard.add(to.id)
            grew = true
          }
        }
      }
    }
  }
  const returns = channels.filter((channel) => channel.kind === 'return')
  const blocked = new Map(channels.map((from) => [from.id, new Set(returns.filter((to) => to.id !== from.id && !open(from, to)).map((to) => to.id))] as const))
  return { heard, blocked }
}
