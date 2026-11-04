import { lazy, Suspense } from 'react'

const LibraryPanel = lazy(() => import('./LibraryPanel').then((module) => ({ default: module.LibraryPanel })))

/** The library, loaded the first time it is shown. */
export const LibraryView = () => (
  <Suspense fallback={<p>Opening library…</p>}>
    <LibraryPanel />
  </Suspense>
)
