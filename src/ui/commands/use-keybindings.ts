import { type CommandContext, canRunCommand, runCommand } from '@state'
import { useEffect, useRef } from 'react'
import { viewOfElement } from '../layout/group-focus'
import { focusSubjects } from '../shared/menu'
import type { Binding } from './keybindings'
import { IS_APPLE, keyOf } from './keys'
import { commandById } from './registry'
import { scopeHolds } from './scopes'

/** What every command runs with but the focus: the services and the project's files. */
export type CommandServices = Omit<CommandContext, 'origin' | 'focus'>

/** The context for a key pressed, or the palette opened, with the focus on `element`: its view and its subjects. */
export const commandContextFor = (services: CommandServices, element: Element | null): CommandContext => ({
  ...services,
  origin: viewOfElement(element) ?? null,
  focus: focusSubjects(element),
})

/**
 * The one global key listener, on `window` in the bubble phase, so a view's own handler runs first and can take a key
 * (the piano roll's ⌘D). It runs the first command bound to the key whose scope holds and that applies and is
 * enabled, and prevents the browser's handling only then: an edit key with nothing focused to act on is the browser's.
 * A held key runs a command again only if it allows repeats; otherwise the repeat is swallowed.
 */
export const useKeybindings = (bindings: readonly Binding[], services: CommandServices): void => {
  const latest = useRef({ bindings, services })
  useEffect(() => {
    latest.current = { bindings, services }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const key = keyOf(event, IS_APPLE)
      if (!key) return
      const element = event.target instanceof Element ? event.target : null
      const bound = latest.current.bindings.filter((binding) => binding.key === key && scopeHolds(binding.scope, element))
      if (bound.length === 0) return
      const context = commandContextFor(latest.current.services, element)
      for (const binding of bound) {
        const command = commandById(binding.command)
        if (!command || !canRunCommand(command, context)) continue
        event.preventDefault()
        if (!event.repeat || command.repeat) void runCommand(command, context)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
