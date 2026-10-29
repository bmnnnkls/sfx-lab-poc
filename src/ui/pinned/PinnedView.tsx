import { type ControlOwner, type TrackGraph, canPin, livePins, pinnedGraph } from '@core'
import { type Subject, runAction, sameItems, useGraphViewStore, useProjectSelect, useSelectionStore } from '@state'
import { useEffect, useRef } from 'react'
import { useActionContext } from '../shared/menu'
import { PinnedPanel } from './PinnedPanel'
import { pinTitle } from './pin-title'
import styles from './PinnedView.module.css'

/** What the empty state offers to pin: each panel of what is selected that isn't pinned, and the action that pins it. */
interface Offer {
  readonly title: string
  readonly action: string
  readonly subject: Subject
  readonly choice?: string
}

const GRAPHS: readonly TrackGraph[] = ['patch', 'fx', 'notes']

const useOffers = (): readonly Offer[] => {
  const trackId = useSelectionStore((state) => state.trackId)
  const groupId = useSelectionStore((state) => state.groupId)
  const master = useSelectionStore((state) => state.master)
  const owner: ControlOwner | undefined = trackId ? { kind: 'track', trackId } : groupId ? { kind: 'group', groupId } : master ? { kind: 'master' } : undefined
  return useProjectSelect(
    (project) => {
      if (!owner) return []
      return GRAPHS.flatMap((graph): Offer[] => {
        const pin = { owner, graph }
        if (!pinnedGraph(project, pin) || !canPin(project, pin)) return []
        const title = `Pin ${pinTitle(project, pin)}`
        if (owner.kind === 'track') return [{ title, action: 'track.pin', subject: { kind: 'track', trackId: owner.trackId }, choice: graph }]
        return [{ title, action: owner.kind === 'group' ? 'group.pin' : 'master.pin', subject: owner.kind === 'group' ? { kind: 'group', groupId: owner.groupId } : { kind: 'master' } }]
      })
    },
    (a, b) => sameItems(a.map((offer) => offer.title), b.map((offer) => offer.title)),
  )
}

/**
 * The pinned front panels, stacked top to bottom, to play while the editors show something else. Pinning asks this
 * view (through the graph-view store's `pinRequest`) to scroll the pin into view and focus its header.
 */
export const PinnedView = () => {
  const context = useActionContext()
  const keys = useProjectSelect((project) => livePins(project).map((entry) => entry.key), sameItems)
  const offers = useOffers()
  const list = useRef<HTMLUListElement>(null)
  const request = useGraphViewStore((state) => state.pinRequest)
  useEffect(() => {
    if (!request) return
    const pin = list.current?.querySelector<HTMLElement>(`[data-pin-key="${CSS.escape(request)}"]`)
    if (!pin) return
    useGraphViewStore.getState().requestPin(null)
    pin.scrollIntoView({ block: 'nearest' })
    pin.querySelector<HTMLElement>('header')?.focus({ preventScroll: true })
  }, [request, keys])

  if (keys.length === 0) {
    return (
      <div className={styles.view}>
        <div className={styles.empty}>
          <p>
            Nothing is pinned. Pin a panel from a track's menu, or with <em>Pin</em> in Instrument, Effects or Notes.
          </p>
          {offers.map((offer) => (
            <button key={offer.title} onClick={() => runAction(offer.action, offer.subject, context, { choice: offer.choice })}>
              {offer.title}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className={styles.view}>
      <ul ref={list} className={styles.list} role="list">
        {keys.map((key) => (
          <li key={key}>
            <PinnedPanel pinKey={key} />
          </li>
        ))}
      </ul>
    </div>
  )
}
