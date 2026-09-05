import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { browserPlatform } from './adapters/browser'
import { isTauri, tauriPlatform } from './adapters/tauri'
import App from './App.tsx'

// One build, two homes: inside the desktop shell the Rust side owns the
// disk; in Edge or Chrome the File System Access API does.
const platform = isTauri() ? tauriPlatform() : browserPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
)
