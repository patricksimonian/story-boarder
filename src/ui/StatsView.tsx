import { useState } from 'react'
import type { Story } from '../domain/types'
import { storyStats, type EntryCount } from '../stats/stats'

/**
 * Writing stats and the word goal. Counts come fresh from the loaded
 * story; the goal lives in story.json settings and travels with the
 * folder. A scene's count is its prose — synopsis and beats are
 * planning, not writing.
 */
export function StatsView({ story, onSetGoal }: { story: Story; onSetGoal: (words: number | undefined) => void }) {
  const stats = storyStats(story)
  const saved = (story.manifest.settings as { goals?: { storyWords?: number } }).goals?.storyWords
  const [goalText, setGoalText] = useState(saved === undefined ? '' : String(saved))

  const commitGoal = () => {
    const parsed = Number(goalText)
    const goal = goalText.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
    if (goal !== saved) onSetGoal(goal)
  }

  return (
    <section className="hist-wrap" role="region" aria-label="Stats">
      <div className="view-bar">
        <h2>Stats</h2>
        <span className="view-sub">what the writing weighs — prose counted, planning left out</span>
      </div>
      <p>
        The story holds <strong>{stats.sceneWords} words</strong> of scene prose.
      </p>
      <label className="notes-sectrow">
        Word goal
        <input
          type="number"
          aria-label="Word goal"
          placeholder="none set"
          min={0}
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
          onBlur={commitGoal}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitGoal()
          }}
        />
      </label>
      {saved !== undefined && saved > 0 && (
        <p>
          {stats.sceneWords} of {saved} — {Math.min(100, Math.round((stats.sceneWords / saved) * 100))}%
          <progress className="ml-2 align-middle" value={Math.min(stats.sceneWords, saved)} max={saved} />
        </p>
      )}
      <CountList heading="Scenes" entries={stats.scenes} />
      <CountList heading="Library" entries={stats.references} />
      <CountList heading="Notebook" entries={stats.notes} />
    </section>
  )
}

function CountList({ heading, entries }: { heading: string; entries: EntryCount[] }) {
  if (entries.length === 0) return null
  return (
    <div className="mt-3">
      <h3>{heading}</h3>
      <ul className="m-0 list-none p-0">
        {entries.map((entry) => (
          <li key={entry.id} className="flex max-w-md justify-between gap-4 py-0.5">
            <span className="min-w-0 truncate">{entry.title}</span>
            <span className="opacity-70">{entry.words}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
