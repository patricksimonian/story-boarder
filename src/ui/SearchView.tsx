import { useMemo, useState } from 'react'
import type { Story } from '../domain/types'
import { searchStory, type SearchHit } from '../search/search'

/**
 * Full-text search over everything the story holds. No index — the
 * loaded story is every file in memory, rescanned as the query changes.
 */
export function SearchView({ story, onOpen }: { story: Story; onOpen: (hit: SearchHit) => void }) {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => searchStory(story, query), [story, query])

  return (
    <section className="hist-wrap" role="region" aria-label="Search">
      <div className="view-bar">
        <h2>Search</h2>
        <span className="view-sub">every scene, note, and library page</span>
      </div>
      <input
        type="search"
        className="notes-nameinput"
        aria-label="Search the story"
        placeholder="Words to find — all of them must land in the same entry"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 flex flex-col items-start gap-1">
        {hits.map((hit) => (
          <button
            key={`${hit.kind}/${hit.id}`}
            className="notes-item cursor-pointer text-left"
            aria-label={`Open ${hit.kind} ${hit.title}`}
            onClick={() => onOpen(hit)}
          >
            <span className="mr-2 rounded bg-line/40 px-1 text-xs">{hit.kind}</span>
            <strong>{hit.title}</strong>
            {hit.snippet !== '' && <span className="ml-2 opacity-70">{hit.snippet}</span>}
          </button>
        ))}
      </div>
      {query.trim() !== '' && hits.length === 0 && <p className="hist-empty">Nothing holds those words.</p>}
    </section>
  )
}
