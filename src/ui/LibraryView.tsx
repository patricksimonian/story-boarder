import { useState } from 'react'
import type { FileAccess } from '../adapters/types'
import type { ReferenceEntity, ReferenceKind, Slug, Story } from '../domain/types'
import type { MentionContext } from '../mentions/context'
import { MoodBoard } from './MoodBoard'
import { ProseEditor } from './ProseEditor'

/** Tags are one comma-separated field, held as local text so a comma being typed isn't normalized away. */
function TagsField({ entity, onEdit }: { entity: ReferenceEntity; onEdit: (entity: ReferenceEntity) => void }) {
  const [text, setText] = useState(entity.tags.join(', '))
  return (
    <label className="notes-sectrow">
      Tags
      <input
        aria-label="Tags"
        placeholder="comma, separated"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onEdit({
            ...entity,
            tags: e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          })
        }}
      />
    </label>
  )
}

/** Other names the prose uses for this thing — "the smith", "Rook of Tanner's Row" — the same field shape as tags. */
function AliasesField({ entity, onEdit }: { entity: ReferenceEntity; onEdit: (entity: ReferenceEntity) => void }) {
  const [text, setText] = useState(entity.aliases.join(', '))
  return (
    <label className="notes-sectrow">
      Also called
      <input
        aria-label="Aliases"
        placeholder="the smith, the old man"
        title="Other names the prose uses for this; each one lights up as a mention"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onEdit({
            ...entity,
            aliases: e.target.value
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
          })
        }}
      />
    </label>
  )
}

const KINDS: { kind: ReferenceKind; label: string; one: string }[] = [
  { kind: 'character', label: 'Characters', one: 'character' },
  { kind: 'place', label: 'Places', one: 'place' },
  { kind: 'lore', label: 'Lore', one: 'lore' },
]

/**
 * The reference library: characters, places, and lore, explorer-shaped
 * like the notebook but with three fixed folders — the kinds. Pick one
 * to highlight it and a new entity lands inside it; a page edits with
 * the notebook's safety rails.
 */
export function LibraryView({
  story,
  files,
  selected,
  onSelect,
  onCreate,
  onEdit,
  onAddImages,
  onDelete,
  mentions,
}: {
  story: Story
  files: FileAccess
  /** The open entity as the draft holds it, or null when none is open. */
  selected: ReferenceEntity | null
  onSelect: (kind: ReferenceKind, id: Slug) => void
  onCreate: (kind: ReferenceKind, title: string) => void
  onEdit: (entity: ReferenceEntity) => void
  /** Stores the picked files under assets/ and pins them to the open page. */
  onAddImages: (picked: File[]) => void
  onDelete: () => void
  mentions?: MentionContext
}) {
  const [picked, setPicked] = useState<ReferenceKind>('character')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const entitiesOf = (kind: ReferenceKind) =>
    [...story.references.values()].filter((e) => e.kind === kind).sort((a, b) => a.title.localeCompare(b.title))

  const pickedLabel = KINDS.find((k) => k.kind === picked)!
  const defaultName = `New ${pickedLabel.one}`

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    onCreate(picked, trimmed)
    setNaming(false)
    setName('')
  }

  return (
    <section className="hist-wrap" role="region" aria-label="Library">
      <div className="view-bar">
        <h2>Library</h2>
        <span className="view-sub">characters, places, and lore — pick a shelf, and new pages land on it</span>
      </div>
      <div className="notes-split">
        <div className="notes-list">
          <div className="notes-tools">
            <button
              aria-label={`New ${pickedLabel.one}`}
              title={`New ${pickedLabel.one} on the ${pickedLabel.label} shelf`}
              onClick={() => {
                setNaming(!naming)
                setName(defaultName)
              }}
            >
              📇＋
            </button>
          </div>
          {KINDS.map(({ kind, label, one }) => (
            <div key={kind}>
              <button
                className={`notes-sectbtn ${picked === kind ? 'picked' : ''}`}
                aria-label={`Shelf ${label}`}
                onClick={() => setPicked(kind)}
              >
                {picked === kind ? '📂' : '📁'} {label}
              </button>
              {naming && picked === kind && (
                // The new row appears in place on its shelf, name selected
                // for typing over. Enter commits; Escape abandons; so does
                // clicking away without touching the name.
                <input
                  className="notes-nameinput block w-full"
                  style={{ paddingLeft: 22 }}
                  aria-label={`New ${one} title`}
                  value={name}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    if (name.trim() !== '' && name !== defaultName) submit()
                    else setNaming(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit()
                    if (e.key === 'Escape') setNaming(false)
                  }}
                />
              )}
              {entitiesOf(kind).map((entity) => (
                <button
                  key={entity.id}
                  className={`notes-item ${selected?.id === entity.id && selected.kind === kind ? 'active' : ''}`}
                  style={{ paddingLeft: 22 }}
                  aria-label={`Open ${one} ${entity.title}`}
                  onClick={() => onSelect(kind, entity.id)}
                >
                  {entity.title}
                </button>
              ))}
            </div>
          ))}
        </div>
        {selected ? (
          <div className="notes-page" key={`${selected.kind}/${selected.id}`}>
            <input
              className="notes-title"
              aria-label="Title"
              value={selected.title}
              onChange={(e) => onEdit({ ...selected, title: e.target.value })}
            />
            <TagsField key={`tags-${selected.kind}/${selected.id}`} entity={selected} onEdit={onEdit} />
            <AliasesField key={`aliases-${selected.kind}/${selected.id}`} entity={selected} onEdit={onEdit} />
            <ProseEditor
              key={`${selected.kind}/${selected.id}`}
              markdown={selected.body}
              onChange={(body) => onEdit({ ...selected, body })}
              mentions={mentions}
            />
            <MoodBoard
              images={selected.images}
              files={files}
              onAdd={onAddImages}
              onRemove={(path) => onEdit({ ...selected, images: selected.images.filter((p) => p !== path) })}
            />
            <div className="ed-section danger-zone">
              {!confirmingDelete ? (
                <button type="button" className="danger-link" onClick={() => setConfirmingDelete(true)}>
                  Delete {KINDS.find((k) => k.kind === selected.kind)?.one}…
                </button>
              ) : (
                <>
                  <p>
                    The file goes. A scene citing {selected.title} keeps the citation as written — Analysis points at
                    it.
                  </p>
                  <div className="create-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setConfirmingDelete(false)
                        onDelete()
                      }}
                    >
                      Delete
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
