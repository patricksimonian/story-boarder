import { TEMPLATES } from '../story/templates'

export function StartScreen({
  recents,
  error,
  emptyFolder,
  onPick,
  onOpenRecent,
  onStartNew,
  onImport,
}: {
  recents: string[]
  error: string | null
  /** The name of a just-picked folder that has no story.json — a story can start there. */
  emptyFolder: string | null
  onPick: () => void
  onOpenRecent: (name: string) => void
  /** Starts a story in the empty folder — from a template when one is named, bare otherwise. */
  onStartNew: (template?: string) => void
  onImport: () => void
}) {
  return (
    <main className="start">
      <h1>Story Boarder</h1>
      <span className="text-xs opacity-60">v{__APP_VERSION__}</span>
      <p className="start-sub">No story folder open.</p>
      <button className="start-open" onClick={onPick}>
        Open a story folder
      </button>
      {error && <p className="start-error">{error}</p>}
      {emptyFolder && (
        <button className="start-open start-new" onClick={() => onStartNew()}>
          Start a new story in {emptyFolder}
        </button>
      )}
      {emptyFolder && (
        <div className="my-1 flex flex-wrap justify-center gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="cursor-pointer rounded border border-line bg-transparent px-2 py-1 text-sm"
              title={t.blurb}
              onClick={() => onStartNew(t.id)}
            >
              Begin from {t.name}
            </button>
          ))}
        </div>
      )}
      {emptyFolder && (
        <button className="start-open start-new" onClick={onImport}>
          Import a Twine or Plottr file into {emptyFolder}
        </button>
      )}
      {recents.length > 0 && (
        <section className="start-recents">
          <h2>Recent</h2>
          <ul>
            {recents.map((name) => (
              <li key={name}>
                <button onClick={() => onOpenRecent(name)}>{name}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="start-note">
        A story folder is any folder with a story.json inside. Pick an existing story to get started or an empty folder and
        the app can start a story there.
      </p>
    </main>
  )
}
