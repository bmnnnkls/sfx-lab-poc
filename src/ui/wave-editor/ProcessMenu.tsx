import type { Subject } from '@state'
import { Icon } from '../shared/icon'
import { PopupMenu, useActionContext, useActionEntries } from '../shared/menu'

/**
 * *Process*: the `sample-selection` subject's processes, the same actions the right-click menu shows (built from the
 * registry), with *Fade in* and *Fade out* as submenus of curves. An entry with settings opens its popover.
 */
export const ProcessMenu = ({ subject }: { subject: Subject }) => {
  const context = useActionContext()
  return (
    <PopupMenu entries={() => useActionEntries(subject, context, (item) => item.group === 'process')}>
      <button aria-label="Process" title="Process the selection, or the whole sample">
        Process <Icon name="chevron-down" size={14} />
      </button>
    </PopupMenu>
  )
}
