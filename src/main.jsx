import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Before the app renders, so the browser's one-time install offer isn't missed.
import './lib/install.js'
import App from './App.jsx'

// The service worker makes StudyPack installable and lets it appear in other
// apps' Share menus (public/sw.js). Production only, so it never caches dev builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed:', err))
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
