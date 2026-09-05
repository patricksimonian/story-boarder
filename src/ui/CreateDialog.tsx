import { useState } from 'react'
import type { StoryManifest } from '../domain/types'
import type { NewScene, NewStoryline } from '../story/mutations'
import { GLYPHS } from './glyphs'
import { Glyph } from './SceneBadges'
import { colorForName } from './storylineColor'

export type Creating = 'scene' | 'act' | 'storyline'

export function Dialog({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="create-backdrop">
      <div role="dialog" aria-label={label} className="create-dialog">
        <h3>{label}</h3>
        {children}
      </div>
    </div>
  )
}

/** The glyph grid: one radio per glyph, with those other storylines carry greyed out. */
export function GlyphPicker({
  value,
  taken,
  onChange,
}: {
  value: string
  /** Glyphs carried by other storylines. */
  taken: Set<string>
  onChange: (glyph: string) => void
}) {
  // With every glyph taken, reuse beats blocking the choice outright.
  const allTaken = GLYPHS.every((g) => taken.has(g))
  return (
    <fieldset>
      <legend>Glyph</legend>
      <div className="glyph-grid" role="radiogroup" aria-label="Glyph">
        {GLYPHS.map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={value === g}
            className={`glyph-choice ${value === g ? 'selected' : ''}`}
            disabled={!allTaken && taken.has(g) && g !== value}
            title={taken.has(g) ? 'Already carried by a storyline' : undefined}
            onClick={() => onChange(g)}
          >
            {g}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function NewSceneDialog({
  manifest,
  onCreate,
  onCancel,
}: {
  manifest: StoryManifest
  onCreate: (spec: NewScene) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [act, setAct] = useState('')
  const [memberships, setMemberships] = useState<string[]>([])

  return (
    <Dialog label="New scene">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <label>
        Act
        <select value={act} onChange={(e) => setAct(e.target.value)}>
          <option value="">— none yet —</option>
          {manifest.acts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Storylines (none = idea pool)</legend>
        {manifest.storylines.map((line) => (
          <label key={line.id} className="check">
            <input
              type="checkbox"
              checked={memberships.includes(line.id)}
              onChange={(e) =>
                setMemberships(
                  e.target.checked
                    ? [...memberships, line.id]
                    : memberships.filter((id) => id !== line.id),
                )
              }
            />
            <Glyph color={line.color} glyph={line.glyph} /> {line.name}
          </label>
        ))}
      </fieldset>
      <div className="create-actions">
        <button
          disabled={title.trim() === ''}
          onClick={() =>
            onCreate({ title: title.trim(), storylines: memberships, act: act || undefined })
          }
        >
          Create
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Dialog>
  )
}

export function NewActDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  return (
    <Dialog label="New act">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <div className="create-actions">
        <button disabled={title.trim() === ''} onClick={() => onCreate(title.trim())}>
          Create
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Dialog>
  )
}

export function NewStorylineDialog({
  manifest,
  onCreate,
  onCancel,
}: {
  manifest: StoryManifest
  onCreate: (spec: NewStoryline) => void
  onCancel: () => void
}) {
  const usedColors = manifest.storylines.map((s) => s.color)
  const usedGlyphs = new Set(manifest.storylines.map((s) => s.glyph))

  const [name, setName] = useState('')
  const [glyph, setGlyph] = useState(GLYPHS.find((g) => !usedGlyphs.has(g)) ?? GLYPHS[0])
  // The color follows the name until the author picks one by hand.
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const color = pickedColor ?? colorForName(name, usedColors)

  return (
    <Dialog label="New storyline">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <GlyphPicker value={glyph} taken={usedGlyphs} onChange={setGlyph} />
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setPickedColor(e.target.value)} />
      </label>
      <div className="create-actions">
        <button
          disabled={name.trim() === ''}
          onClick={() => onCreate({ name: name.trim(), glyph, color })}
        >
          Create
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Dialog>
  )
}
