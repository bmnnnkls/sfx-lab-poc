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

// Created once, outside React, so the saved project is loaded before the first render.
const services = createServices()

createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
)
