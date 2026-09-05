import type { Scene } from '../domain/types'

/**
 * Every card a scene appears as opens the editor on click, and reads as a
 * button to keyboards and screen readers. Cards hold headings and badge
 * rows, which a real <button> can't, so the role is declared instead.
 */
export function openSceneProps(scene: Scene, onOpen: (id: string) => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `Open scene ${scene.title}`,
    onClick: () => onOpen(scene.id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen(scene.id)
      }
    },
  }
}
