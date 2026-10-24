import { type ActionContext, type ViewId, useEngineControls, usePersonalLibrary, useSampleLibrary } from '@state'
import { createContext, useContext, useMemo } from 'react'

export const ViewOrigin = createContext<ViewId | null>(null)

/** Set by each view's host, so actions know which view a menu or button is in. */
export const ViewOriginProvider = ViewOrigin.Provider

/** What actions run with: the services from React context, and the view this component is in. */
export const useActionContext = (): ActionContext => {
  const engine = useEngineControls()
  const samples = useSampleLibrary()
  const library = usePersonalLibrary()
  const origin = useContext(ViewOrigin)
  return useMemo(() => ({ engine, samples, library, origin }), [engine, samples, library, origin])
}
