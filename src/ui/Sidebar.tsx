import type { StoryManifest } from '../domain/types'
import type { View } from '../state/view'
import { Glyph } from './SceneBadges'

export function Sidebar({
  title,
  manifest,
  view,
  poolOpen,
  poolCount,
  onView,
  onTogglePool,
  onEditStoryline,
  onGoStoryline,
  onEditAct,
  onCheckpoint,
  onHome,
  variableCount,
  findingCount,
  noteCount,
  referenceCount,
  children,
}: {
  title: string
  manifest: StoryManifest
  view: View
  poolOpen: boolean
  poolCount: number
  variableCount: number
  findingCount: number
  noteCount: number
  referenceCount: number
  onView: (view: View) => void
  onTogglePool: () => void
  onEditStoryline: (id: string) => void
  onGoStoryline: (id: string) => void
  onEditAct: (id: string) => void
  onCheckpoint: () => void
  /** Back to the start screen: this story released, another one a click away. */
  onHome: () => void
  children?: React.ReactNode
}) {
  return (
    <aside className="sidebar">
      <h1 className="sb-title">{title}</h1>
      <button className="sb-item" onClick={onHome} title="Close this story and pick another">
        ⌂ Home
      </button>
      <button
        className={`sb-item ${view.level === 'storylines' ? 'active' : ''}`}
        onClick={() => onView({ level: 'storylines' })}
      >
        ⌁ Storylines
      </button>
      <button
        className={`sb-item ${view.level === 'overview' ? 'active' : ''}`}
        onClick={() => onView({ level: 'overview' })}
      >
        ⊞ Overview
      </button>
      <button
        className={`sb-item ${view.level === 'graph' ? 'active' : ''}`}
        onClick={() => onView({ level: 'graph' })}
      >
        ⑂ Graph
      </button>
      <button
        className={`sb-item ${view.level === 'search' ? 'active' : ''}`}
        onClick={() => onView({ level: 'search' })}
      >
        🔎 Search
      </button>
      <button
        className={`sb-item ${view.level === 'stats' ? 'active' : ''}`}
        onClick={() => onView({ level: 'stats' })}
      >
        🎯 Stats
      </button>
      <div className="sb-sect">Acts</div>
      {manifest.acts.map((act) => (
        <div key={act.id} className="sb-actrow">
          <button
            className={`sb-item ${view.level === 'act' && view.act === act.id ? 'active' : ''}`}
            onClick={() => onView({ level: 'act', act: act.id })}
          >
            <span>{act.title}</span>
          </button>
          <button
            className="sb-actpen"
            aria-label={`Edit act ${act.title}`}
            title="Edit act"
            onClick={() => onEditAct(act.id)}
          >
            ✎
          </button>
        </div>
      ))}
      <div className="sb-sect">Storylines</div>
      {manifest.storylines.map((line) => (
        <div key={line.id} className="sb-legend">
          <button
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit [font:inherit]"
            aria-label={`Go to storyline ${line.name}`}
            title="Go to storyline"
            onClick={() => onGoStoryline(line.id)}
          >
            <Glyph color={line.color} glyph={line.glyph} /> <span className="min-w-0 flex-1 truncate">{line.name}</span>
          </button>
          <button
            className="sb-pen"
            aria-label={`Edit storyline ${line.name}`}
            title="Edit storyline"
            onClick={() => onEditStoryline(line.id)}
          >
            ✎
          </button>
        </div>
      ))}
      <div className="sb-sect">Loose scenes</div>
      <button className={`sb-item ${poolOpen ? 'active' : ''}`} onClick={onTogglePool}>
        {poolOpen ? '✕' : '◫'} Idea pool ({poolCount})
      </button>
      <div className="sb-sect">Notebook</div>
      <button
        className={`sb-item ${view.level === 'notes' ? 'active' : ''}`}
        onClick={() => onView({ level: 'notes' })}
      >
        🗒 Notes ({noteCount})
      </button>
      <div className="sb-sect">Library</div>
      <button
        className={`sb-item ${view.level === 'library' ? 'active' : ''}`}
        onClick={() => onView({ level: 'library' })}
      >
        📇 Library ({referenceCount})
      </button>
      <div className="sb-sect">Engine</div>
      <button
        className={`sb-item ${view.level === 'coach' ? 'active' : ''}`}
        onClick={() => onView({ level: 'coach' })}
      >
        🧭 Coach
      </button>
      <button
        className={`sb-item ${view.level === 'variables' ? 'active' : ''}`}
        onClick={() => onView({ level: 'variables' })}
      >
        ⚙ Variables ({variableCount})
      </button>
      <button
        className={`sb-item ${view.level === 'simulate' ? 'active' : ''}`}
        onClick={() => onView({ level: 'simulate' })}
      >
        ▶ Simulate
      </button>
      <button
        className={`sb-item ${view.level === 'analysis' ? 'active' : ''}`}
        onClick={() => onView({ level: 'analysis' })}
      >
        ✓ Analysis ({findingCount})
      </button>
      <div className="sb-sect">History</div>
      <button
        className={`sb-item ${view.level === 'history' ? 'active' : ''}`}
        onClick={() => onView({ level: 'history' })}
      >
        🕘 History
      </button>
      <button className="sb-item" onClick={onCheckpoint}>
        ⚑ Checkpoint…
      </button>
      <button className={`sb-item ${view.level === 'sync' ? 'active' : ''}`} onClick={() => onView({ level: 'sync' })}>
        ⇅ Sync
      </button>
      {children}
      <div className="sb-hint">
        Esc zooms out · ←/→ acts
        <br />⤢ opens an act
        <br />wheel over the minimap scrolls the story
        <br />drag a scene to move it · Ctrl+drag shares it
      </div>
    </aside>
  )
}
