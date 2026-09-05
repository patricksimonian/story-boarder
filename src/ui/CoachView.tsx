import type { Story } from '../domain/types'

/**
 * The coach: lessons that check themselves against the loaded story —
 * the tutorial is a quest log and the story is the save file — with the
 * engine's working patterns as cards beneath.
 */
export function CoachView({ story: _story }: { story: Story }) {
  return (
    <section className="hist-wrap" role="region" aria-label="Coach">
      <div className="view-bar">
        <h2>Coach</h2>
        <p>a dynamic coach is coming soon!</p>
      </div>
    </section>
  )
}
