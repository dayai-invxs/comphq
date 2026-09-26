import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Order is load-bearing: the token values first, then the component sheets
// that reference them, then the brand, which re-points custom properties only
// and so has to be last to win.
import '@mond-design-system/tokens/styles.css'
import '@mond-design-system/react/styles.css'
import './tokens/brand-comphq.css'
import './global.css'
import { App } from '@/app/App'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
