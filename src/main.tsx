import '@fontsource-variable/inter/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createServices } from './app/services'
import './ui/theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// The first render waits for the bundled font, so nothing lays out in a fallback and then shifts when it swaps in;
// it's served with the app, so this takes milliseconds. A font that fails to load leaves the fallbacks in place.
await Promise.race([document.fonts.load('13px "Inter Variable"').catch(() => []), new Promise((resolve) => setTimeout(resolve, 1000))])

if (new URLSearchParams(location.search).has('gallery')) {
  // The theme gallery (src/ui/theme/gallery): its own chunk, loaded only here, and no project or audio behind it.
  const { Gallery } = await import('./ui/theme/gallery/Gallery')
  createRoot(root).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  )
} else {
  // Created once, outside React, so the saved project is loaded before the first render.
  const services = createServices()

  createRoot(root).render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  )
}
