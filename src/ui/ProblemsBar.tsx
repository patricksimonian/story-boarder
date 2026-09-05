import { useState } from 'react'
import type { FileProblem } from '../story/loadStory'

/**
 * Flagged files, surfaced but never blocking. Expands to the list;
 * each entry opens the raw editor.
 */
export function ProblemsBar({
  problems,
  onEdit,
}: {
  problems: FileProblem[]
  onEdit: (problem: FileProblem) => void
}) {
  const [open, setOpen] = useState(false)
  if (problems.length === 0) return null
  const label = problems.length === 1 ? '1 file needs attention' : `${problems.length} files need attention`
  return (
    <div className="problems">
      <button className="problems-toggle" onClick={() => setOpen(!open)}>
        ⚠ {label}
      </button>
      {open && (
        <ul className="problems-list">
          {problems.map((problem, i) => (
            <li key={`${problem.path}-${i}`}>
              <button onClick={() => onEdit(problem)}>
                <code>{problem.path}</code> — {problem.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
