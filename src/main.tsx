import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { browserPlatform, helperRunner } from './adapters/browser'
import { forwardErrorsToShell, isTauri, tauriPlatform, tauriRunner } from './adapters/tauri'
import App from './App.tsx'

// One build, two homes: inside the desktop shell the Rust side owns the
// disk; in Edge or Chrome the File System Access API does. The shell
// also gets told about anything the page drops on the floor, since a
// release build has no console to read.
const platform = isTauri() ? tauriPlatform() : browserPlatform()
// The same split for reaching Claude Code: the shell spawns it; a tab
// asks the helper from `pnpm assistant` to.
const runner = isTauri() ? tauriRunner() : helperRunner()
if (isTauri()) forwardErrorsToShell()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={platform} runner={runner} />
  </StrictMode>,
)
