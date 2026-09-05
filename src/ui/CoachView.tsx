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
        <span className="view-sub">
          {doneCount === lessons.length
            ? 'every lesson is alive in this story — the cards below are where to go deeper'
            : `${doneCount} of ${lessons.length} lessons already live in this story — the rest check themselves off as you write`}
        </span>
      </div>
      <ol className="m-0 max-w-2xl list-none p-0">
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            aria-label={`${lesson.title} — ${lesson.done ? 'done' : 'to do'}`}
            className="mt-3 border-b border-line pb-3"
          >
            <div className="font-semibold">
              <span aria-hidden="true">{lesson.done ? '✓ ' : '○ '}</span>
              {lesson.title}
            </div>
            <p className="m-0 mt-1 text-sm">{lesson.why}</p>
            {lesson.done ? (
              <p className="m-0 mt-1 text-sm opacity-70">Done: {lesson.evidence}</p>
            ) : (
              <p className="m-0 mt-1 text-sm opacity-70">{lesson.how}</p>
            )}
          </li>
        ))}
      </ol>
      <h3 className="mt-6">The patterns</h3>
      <p className="view-note">
        Six shapes cover nearly everything a branching story asks of the engine. Each is ordinary scenes and variables
        — no new machinery, just an arrangement.
      </p>
      <div className="max-w-2xl">
        {PATTERNS.map((card) => (
          <div key={card.name} className="mt-3">
            <div className="font-semibold">{card.name}</div>
            <p className="m-0 mt-0.5 text-sm">{card.gist}</p>
            {card.inEmbers !== undefined && (
              <p className="m-0 mt-0.5 text-sm opacity-70">See it working — {card.inEmbers}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
