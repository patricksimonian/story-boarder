import { useState } from 'react'
import type { FileAccess } from '../adapters/types'
import type { ReferenceEntity, ReferenceKind, Slug, Story, TargetKey } from '../domain/types'
import type { MentionContext } from '../mentions/context'
import type { Target } from '../mentions/match'
import { NamedIn } from './NamedIn'
import { ReadOutcome, type ReadInfo } from './ReadOutcome'
import { ChipsField } from './ChipsField'
import { MoodBoard } from './MoodBoard'
import { ProseEditor } from './ProseEditor'

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
  namedIn = [],
  onOpenTarget = () => { },
  aliasProposals = [],
  onAcceptAlias = () => { },
  onDismissAlias = () => {},
  canRead = false,
  reading = false,
  readProblem = null,
  onRead,
  read = null,
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
  /** Everywhere the open page is named, most often first. */
  namedIn?: Target[]
  onOpenTarget?: (key: TargetKey) => void
  /** Phrases the scene read found naming the open page in more than one place. */
  aliasProposals?: string[]
  onAcceptAlias?: (alias: string) => void
  onDismissAlias?: (alias: string) => void
  canRead?: boolean
  reading?: boolean
  readProblem?: string | null
  /** Sends this page to the read now: what its text names, and what it says. */
  onRead?: () => void
  read?: ReadInfo | null
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
            <ChipsField
              key={`tags-${selected.kind}/${selected.id}`}
              label="Tags"
              name="Tags"
              noun="tag"
              values={selected.tags}
              onChange={(tags) => onEdit({ ...selected, tags })}
              placeholder="type one, press Enter"
            />
            <ChipsField
              key={`aliases-${selected.kind}/${selected.id}`}
              label="Also called"
              name="Aliases"
              noun="alias"
              values={selected.aliases}
              onChange={(aliases) => onEdit({ ...selected, aliases })}
              placeholder="the smith, the old man"
              title="Other names the prose uses for this; each one lights up as a mention"
              proposals={aliasProposals}
              onAccept={onAcceptAlias}
              onDismiss={onDismissAlias}
              proposalHint="The scene read found this phrase naming this page in more than one place"
            />
            {onRead && (
              <div className="notes-readrow">
                <button
                  type="button"
                  disabled={!canRead || reading}
                  title="Sends this page to Claude through your own Claude Code and records what its text names and says"
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
            <ReadOutcome read={read} />
            <ProseEditor
              key={`${selected.kind}/${selected.id}`}
              markdown={selected.body}
              onChange={(body) => onEdit({ ...selected, body })}
              mentions={mentions}
            />
            <NamedIn items={namedIn} onOpen={onOpenTarget} />
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
