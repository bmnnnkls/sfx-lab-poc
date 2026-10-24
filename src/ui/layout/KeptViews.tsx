import type { ViewId } from '@state'
import { useState } from 'react'
import { ViewHost } from './ViewHost'

/** A region's views: each is mounted the first time it is shown and then kept, hidden, while another shows. */
export const KeptViews = ({ active }: { active: ViewId }) => {
  const [shown, setShown] = useState<readonly ViewId[]>([active])
  if (!shown.includes(active)) setShown([...shown, active])
  return shown.map((id) => <ViewHost key={id} id={id} visible={id === active} />)
}
