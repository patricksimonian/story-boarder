import type { TargetKey } from '../domain/types'
import { KIND_LABEL } from '../mentions/context'
import type { Target } from '../mentions/match'
import { targetKey } from '../mentions/verdicts'

/**
 * Everywhere the open page is named — the reverse of a mention. A note
 * that names a character lights up on the note; this is the character's
 * side of it: the notes, scenes, and pages that name her, each a link.
 */
export function NamedIn({ items, onOpen }: { items: Target[]; onOpen: (key: TargetKey) => void }) {
  if (items.length === 0) return null
  const groups = new Map<string, Target[]>()
  for (const item of items) {
    const label = KIND_LABEL[item.kind]
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return (
    <div className="ed-section named-in" role="region" aria-label="Named in">
      <label>Named in</label>
      <ul className="named-in-list">
        {[...groups.entries()].map(([label, group]) => (
          <li key={label}>
            <span className="named-in-kind">{label}{group.length === 1 ? '' : 's'}</span>
            {group.map((item) => (
              <button
                key={targetKey(item)}
                type="button"
                className="goto"
                aria-label={`Open ${item.kind} ${item.title}`}
                onClick={() => onOpen(targetKey(item))}
              >
                {item.title} ↗
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
