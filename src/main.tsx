import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createServices } from './app/services'
import './ui/theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// Created once, outside React, so the saved project is loaded before the first render.
const services = createServices()

createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
)
