/**
 * Dev-only visual harness: the app against the in-memory Embers sample,
 * auto-opened, so the board can be eyeballed (or screenshotted headless)
 * without granting a real folder. Served at /demo.html by `pnpm dev`;
 * never part of the built app.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { branchingWorld } from './test/branching'
import { embersWorld } from './test/embers'

// #story=vault opens the branching engine fixture instead of Embers.
const params = new URLSearchParams(location.hash.slice(1))
const world = params.get('story') === 'vault' ? branchingWorld() : embersWorld()

// #unassigned seats a heist scene that has no act yet, so the board's
// leading "No act yet" column can be eyeballed. In-memory writes land at once.
if (params.has('unassigned')) {
  void world.files.readText('story.json').then((text) => {
    const m = JSON.parse(text)
    m.storylines[0].scenes.unshift('a-late-idea')
    void world.files.writeText('story.json', JSON.stringify(m))
  })
  void world.files.writeText(
    'scenes/a-late-idea.md',
    '---\nid: a-late-idea\nstorylines: [heist]\n---\n\n# A Late Idea\n\n## Synopsis\n\nNot placed in time yet.\n',
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={world.platform} />
  </StrictMode>,
)

const clickByText = (text: string, then?: () => void) => {
  const attempt = () => {
    const button = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find(
      (b) => b.textContent.includes(text) || b.getAttribute('aria-label')?.includes(text),
    )
    if (button) {
      button.click()
      then?.()
    } else requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

// #demo=<button text or aria-label> clicks its way one step further after
// opening, so dialogs and the scene editor can be screenshotted headless.
const extra = params.get('demo')
// #scroll=<px> scrolls the Storylines board sideways once it exists.
const scroll = Number(params.get('scroll') ?? 0)
const scrollBoard = () => {
  const el = document.querySelector<HTMLElement>('.b-scroll')
  if (el) el.scrollLeft = scroll
  else requestAnimationFrame(scrollBoard)
}
clickByText('Open a story folder', () => {
  if (scroll) scrollBoard()
  if (extra) clickByText(extra)
})
