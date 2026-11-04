import { type ChannelRoute, type TrackGroup, mixRouting } from '@core'
import { type SubjectOf, runAction, useProjectStore } from '@state'
import { useActionContext } from './menu'
import styles from './MuteSolo.module.css'

const NO_ROUTE: ChannelRoute = { output: null, muted: false, soloed: false }

/** A channel's route through its groups: the same object while the tracks and groups are, so a selector can return it. */
export const useRoute = (id: string): ChannelRoute => useProjectStore((state) => mixRouting(state.project).get(id) ?? NO_ROUTE)

/**
 * M and S. Lit when the channel's own flag is set; half lit when it is muted or soloed only through a group, so the
 * cause shows on the group.
 */
export const MuteSolo = ({ name, muted, soloed, route, onMute, onSolo, kind, compact }: {
  name: string
  /** Small, at the end of a group's band. */
  compact?: boolean
  muted: boolean
  soloed: boolean
  route: ChannelRoute
  onMute: () => void
  onSolo: () => void
  kind: 'track' | 'group'
}) => {
  const viaMute = !muted && route.muted
  const viaSolo = !soloed && route.soloed
  return (
    <div className={`${styles.buttons} ${compact ? styles.compact : ''}`}>
      <button
        className={muted ? styles.mute : viaMute ? styles.muteHalf : ''}
        aria-pressed={muted}
        aria-label={`${name} mute`}
        data-through-group={viaMute || undefined}
        title={viaMute ? 'Muted through its group' : kind === 'group' ? "Mute: silence the group's tracks, including their sends" : 'Mute: silence the track, including its sends'}
        onClick={onMute}
      >
        M
      </button>
      <button
        className={soloed ? styles.solo : viaSolo ? styles.soloHalf : ''}
        aria-pressed={soloed}
        aria-label={`${name} solo`}
        data-through-group={viaSolo || undefined}
        title={viaSolo ? 'Soloed through its group' : kind === 'group' ? "Solo: hear only the group's tracks (and what they feed)" : 'Solo: hear only soloed tracks (and the returns they feed)'}
        onClick={onSolo}
      >
        S
      </button>
    </div>
  )
}

/** A group's M and S, through its actions. */
export const GroupMuteSolo = ({ group, compact }: { group: TrackGroup; compact?: boolean }) => {
  const context = useActionContext()
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const route = useRoute(group.id)
  // A folder has no channel of its own: only what an enclosing group says lights its buttons halfway.
  const parent = useRoute(group.parentId ?? '')
  return (
    <MuteSolo
      kind="group"
      compact={compact}
      name={group.name}
      muted={group.muted === true}
      soloed={group.soloed === true}
      route={group.bus ? route : parent}
      onMute={() => runAction('group.mute', subject, context)}
      onSolo={() => runAction('group.solo', subject, context)}
    />
  )
}

