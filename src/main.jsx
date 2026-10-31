import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.jsx'
import { DataProvider } from './lib/data.jsx'
import { intro, starfield } from './lib/motion.js'
import { installTips } from './lib/ui.js'

installTips()
if (!location.hash) history.replaceState(null, '', '#/overview')
starfield(document.getElementById('starfield'))

// The warp plays once per session before the app appears; any click or key skips it
intro().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <DataProvider>
        <App />
      </DataProvider>
    </StrictMode>,
  )
})
