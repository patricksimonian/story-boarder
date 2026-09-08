/**
 * What the last read of this page found, shown where the writer pressed
 * Read: when it ran and what it recorded, then the developments
 * themselves. A read that found nothing says so rather than leaving the
 * button to settle back in silence.
 */
export interface ReadInfo {
  summary: string
  developments: { title: string; fact: string; quote: string }[]
}

export function ReadOutcome({ read }: { read?: ReadInfo | null }) {
  if (!read) return null
  return (
    <div className="read-outcome" role="region" aria-label="Last read">
      <p className="read-summary">{read.summary}</p>
      {read.developments.length > 0 && (
        <ul className="read-developments">
          {read.developments.map((d, i) => (
            <li key={i}>
              <span className="read-entity">{d.title}</span> <span title={d.quote}>{d.fact}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
