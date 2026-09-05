import { useState } from 'react'
import type { Slug, Story } from '../domain/types'
import type { StorylineIdentity } from '../story/mutations'
import { Dialog, GlyphPicker } from './CreateDialog'

/** Which piece of structure is open for editing. */
export type Editing = { kind: 'storyline'; id: Slug } | { kind: 'act'; id: Slug }

/**
 * Edit one act: its title, its column position, and its removal. Only an
 * empty act can go — scenes still in it would have to land somewhere,
 * and that's the writer's decision, not the dialog's.
 */
export function EditActDialog({
  story,
  id,
  onSave,
  onMove,
  onDelete,
  onCancel,
}: {
  story: Story
  id: Slug
  onSave: (title: string) => void
  onMove: (toIndex: number) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const { manifest } = story
  const index = manifest.acts.findIndex((a) => a.id === id)
  const act = manifest.acts[index]
  const [title, setTitle] = useState(act?.title ?? '')
  const [confirming, setConfirming] = useState(false)
  if (!act) return null

  const held = [...story.scenes.values()].filter((s) => s.act === id).length

  return (
    <Dialog label="Edit act">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <fieldset>
        <legend>Position</legend>
        <div className="move-row">
          <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>
            ← Move up
          </button>
          <button type="button" disabled={index === manifest.acts.length - 1} onClick={() => onMove(index + 1)}>
            → Move down
          </button>
          <span className="move-note">
            act {index + 1} of {manifest.acts.length}
          </span>
        </div>
      </fieldset>
      <div className="create-actions">
        <button disabled={title.trim() === ''} onClick={() => onSave(title.trim())}>
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <div className="danger-zone">
        {held > 0 ? (
          <>
            <p>
              This act holds {held} {held === 1 ? 'scene' : 'scenes'} — move them to another act first.
            </p>
            <button type="button" className="danger-link" disabled>
              Delete act…
            </button>
          </>
        ) : !confirming ? (
          <button type="button" className="danger-link" onClick={() => setConfirming(true)}>
            Delete act…
          </button>
        ) : (
          <>
            <p>The act is empty; nothing else changes.</p>
            <div className="create-actions">
              <button type="button" className="danger" onClick={onDelete}>
                Delete act
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

/**
 * Edit one storyline: its identity (name, glyph, color), its lane
 * position, and its removal. Moves apply at once — the lane order is
 * visible behind the dialog — while identity waits for Save.
 */
export function EditStorylineDialog({
  story,
  id,
  onSave,
  onMove,
  onDelete,
  onCancel,
}: {
  story: Story
  id: Slug
  onSave: (patch: StorylineIdentity) => void
  onMove: (toIndex: number) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const { manifest } = story
  const index = manifest.storylines.findIndex((s) => s.id === id)
  const storyline = manifest.storylines[index]
  const [name, setName] = useState(storyline?.name ?? '')
  const [glyph, setGlyph] = useState(storyline?.glyph ?? '')
  const [color, setColor] = useState(storyline?.color ?? '#888888')
  const [confirming, setConfirming] = useState(false)
  if (!storyline) return null

  const taken = new Set(manifest.storylines.filter((s) => s.id !== id).map((s) => s.glyph))
  const members = [...story.scenes.values()].filter((s) => s.storylines.includes(id))
  const goingLoose = members.filter((s) => s.storylines.length === 1).length

  return (
    <Dialog label="Edit storyline">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <GlyphPicker value={glyph} taken={taken} onChange={setGlyph} />
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <fieldset>
        <legend>Lane</legend>
        <div className="move-row">
          <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>
            ↑ Move up
          </button>
          <button
            type="button"
            disabled={index === manifest.storylines.length - 1}
            onClick={() => onMove(index + 1)}
          >
            ↓ Move down
          </button>
          <span className="move-note">
            lane {index + 1} of {manifest.storylines.length}
          </span>
        </div>
      </fieldset>
      <div className="create-actions">
        <button disabled={name.trim() === ''} onClick={() => onSave({ name: name.trim(), glyph, color })}>
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <div className="danger-zone">
        {!confirming ? (
          <button type="button" className="danger-link" onClick={() => setConfirming(true)}>
            Delete storyline…
          </button>
        ) : (
          <>
            <p>
              {members.length === 0
                ? 'No scenes are in it.'
                : `${members.length} ${members.length === 1 ? 'scene loses' : 'scenes lose'} this membership` +
                  (goingLoose > 0
                    ? `; ${goingLoose} ${goingLoose === 1 ? 'goes' : 'go'} to the idea pool.`
                    : '.')}{' '}
              The scene files stay.
            </p>
            <div className="create-actions">
              <button type="button" className="danger" onClick={onDelete}>
                Delete storyline
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
