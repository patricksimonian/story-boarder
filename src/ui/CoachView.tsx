import type { Story } from '../domain/types'
import { checkLessons, PATTERNS } from '../coach/lessons'

/**
 * The coach: lessons that check themselves against the loaded story —
 * the tutorial is a quest log and the story is the save file — with the
 * engine's working patterns as cards beneath.
 */
export function CoachView({ story }: { story: Story }) {
  const lessons = checkLessons(story)
  const doneCount = lessons.filter((l) => l.done).length

  return (
    <section className="hist-wrap" role="region" aria-label="Coach">
      <div className="view-bar">
        <h2>Coach</h2>
        <p>a dynamic coach is coming soon!</p>
      </div>
    </section>
  )
}
