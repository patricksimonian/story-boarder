import { useState } from 'react'
import type { Note, Slug, Story } from '../domain/types'
import type { MentionContext } from '../mentions/context'
import { ProseEditor } from './ProseEditor'

/**
 * The story's notebook, explorer-shaped. Sections are folders: click
 * one to highlight it, and the two toolbar buttons act on the
 * highlight — a new section nests under it (or stands at the root with
 * none picked), a new note lands inside it. Sections nest by path
 * (research/factions) but that path lives in frontmatter and story.json
 * settings; no file ever moves. Moving a note is a pick from the
 * section list, never a rewritable field.
 */
export function NotesView({
  story,
  selected,
  onSelect,
  onCreate,
  onCreateSection,
  onEdit,
  onDelete,
  mentions,
  canRead = false,
  reading = false,
  readProblem = null,
  onRead,
}: {
  story: Story
  /** The open note as the draft holds it, or null when none is open. */
  selected: Note | null
  onSelect: (id: Slug) => void
  onCreate: (title: string, section: string) => void
  onCreateSection: (path: string) => void
  onEdit: (note: Note) => void
  onDelete: () => void
  mentions?: MentionContext
  canRead?: boolean
  reading?: boolean
  readProblem?: string | null
  onRead?: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [naming, setNaming] = useState<'note' | 'section' | null>(null)
  const [name, setName] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const sections = allSections(story)
  const target = picked !== null && sections.includes(picked) ? picked : null

  const notesIn = (path: string | null) =>
    [...story.notes.values()]
      .filter((note) => (note.section ?? '') === (path ?? ''))
      .sort((a, b) => a.title.localeCompare(b.title))

  const DEFAULT_NAMES = { note: 'New note', section: 'New section' }

  const startNaming = (what: 'note' | 'section') => {
    setNaming(naming === what ? null : what)
    setName(DEFAULT_NAMES[what])
  }

  const submit = () => {
    const trimmed = name.trim().replace(/\//g, '-')
    if (trimmed === '') return
    if (naming === 'section') {
      const path = target === null ? trimmed : `${target}/${trimmed}`
      onCreateSection(path)
      setPicked(path)
    } else {
      onCreate(trimmed, target ?? '')
    }
    setNaming(null)
    setName('')
  }

  /**
   * The new row appears in place under its folder, its default name
   * selected for typing over. Enter commits; Escape abandons; so does
   * clicking away without touching the name.
   */
  const namingRow = (depth: number) =>
    naming !== null && (
      <input
        className="notes-nameinput block w-full"
        style={{ paddingLeft: 8 + depth * 14 }}
        aria-label={naming === 'note' ? 'New note title' : 'New section name'}
        value={name}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() !== '' && name !== DEFAULT_NAMES[naming]) submit()
          else setNaming(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setNaming(null)
        }}
      />
    )

  const noteButton = (note: Note, depth: number) => (
    <button
      key={note.id}
      className={`notes-item ${selected?.id === note.id ? 'active' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      aria-label={`Open note ${note.title}`}
      onClick={() => onSelect(note.id)}
    >
      {note.title}
    </button>
  )

  return (
    <section className="hist-wrap" role="region" aria-label="Notes">
      <div className="view-bar">
        <h2>Notes</h2>
        <span className="view-sub">folders and pages — pick a section, and new things land inside it</span>
      </div>
      <div className="notes-split">
        <div className="notes-list">
          <div className="notes-tools">
            <button
              aria-label="New note"
              title={target === null ? 'New note at the root' : `New note in ${target}`}
              onClick={() => startNaming('note')}
            >
              🗒＋
            </button>
            <button
              aria-label="New section"
              title={target === null ? 'New section at the root' : `New section inside ${target}`}
              onClick={() => startNaming('section')}
            >
              📁＋
            </button>
          </div>
          {target === null && namingRow(0)}
          {notesIn(null).map((note) => noteButton(note, 0))}
          {sections.map((path) => {
            const depth = path.split('/').length - 1
            return (
              <div key={path}>
                <button
                  className={`notes-sectbtn ${target === path ? 'picked' : ''}`}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  aria-label={`Section ${path}`}
                  title={path}
                  onClick={() => setPicked(target === path ? null : path)}
                >
                  {target === path ? '📂' : '📁'} {path.split('/').at(-1)}
                </button>
                {target === path && namingRow(depth + 1)}
                {notesIn(path).map((note) => noteButton(note, depth + 1))}
              </div>
            )
          })}
          {story.notes.size === 0 && sections.length === 0 && <p className="hist-empty">No pages yet.</p>}
        </div>
        {selected ? (
          <div className="notes-page" key={selected.id}>
            <input
              className="notes-title"
              aria-label="Title"
              value={selected.title}
              onChange={(e) => onEdit({ ...selected, title: e.target.value })}
            />
            <label className="notes-sectrow">
              Section
              <select
                aria-label="Section"
                value={selected.section ?? ''}
                onChange={(e) => {
                  const next = { ...selected }
                  if (e.target.value === '') delete next.section
                  else next.section = e.target.value
                  onEdit(next)
                }}
              >
                <option value="">— unsorted —</option>
                {sections.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            {onRead && (
              <div className="notes-readrow">
                <button
                  type="button"
                  disabled={!canRead || reading}
                  title="Sends this note to Claude through your own Claude Code and records what it says about who is in it and what changes"
                  onClick={onRead}
                >
                  {reading ? 'Reading…' : 'Read'}
                </button>
                {readProblem && (
                  <span className="ed-readnote" role="alert">
                    {readProblem}
                  </span>
                )}
              </div>
            )}
            <ProseEditor
              key={selected.id}
              markdown={selected.body}
              onChange={(body) => onEdit({ ...selected, body })}
              mentions={mentions}
            />
            <div className="ed-section danger-zone">
              {!confirmingDelete ? (
                <button type="button" className="danger-link" onClick={() => setConfirmingDelete(true)}>
                  Delete note…
                </button>
              ) : (
                <>
                  <p>The file notes/{selected.id}.md goes. Nothing else references notes, so nothing dangles.</p>
                  <div className="create-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setConfirmingDelete(false)
                        onDelete()
                      }}
                    >
                      Delete note
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(false)}>
                      Keep it
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="hist-empty">Pick a page, or start one.</p>
        )}
      </div>
    </section>
  )
}

/**
 * Every section that exists: the explicitly created ones from
 * story.json settings, the ones notes actually sit in, and every
 * ancestor either implies — sorted, so a parent always precedes its
 * children.
 */
function allSections(story: Story): string[] {
  const set = new Set<string>()
  const add = (path: string) => {
    const parts = path.split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'))
  }
  const notebook = (story.manifest.settings as { notebook?: { sections?: unknown } }).notebook
  if (Array.isArray(notebook?.sections)) {
    for (const path of notebook.sections) if (typeof path === 'string') add(path)
  }
  for (const note of story.notes.values()) if (note.section !== undefined) add(note.section)
  return [...set].sort()
}
