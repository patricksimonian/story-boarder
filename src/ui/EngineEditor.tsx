import { useState } from 'react'
import type { Choice, Effect, Scene, Slug, Story } from '../domain/types'
import { checkCondition, checkEffect, parseCondition, parseEffect } from '../engine/expr'

/**
 * The engine block of the editor, now editable: what gates the scene,
 * what it changes, its chance, and the choices that leave it. Every
 * expression is checked against the registry as it's typed, with the
 * problem shown right under the field. Like the rest of the editor it
 * holds nothing itself — each change goes up as a whole scene.
 */
export function EngineEditor({
  scene,
  story,
  revision,
  onChange,
  onOpenScene,
}: {
  scene: Scene
  story: Story
  revision: number
  onChange: (scene: Scene) => void
  onOpenScene: (id: Slug) => void
}) {
  const { registry } = story
  const conditionProblem = scene.condition === undefined ? undefined : problemsIn(scene.condition, 'condition', story)

  const setEffect = (i: number, effect: Effect) =>
    onChange({ ...scene, effects: scene.effects.map((e, k) => (k === i ? effect : e)) })
  const setChoice = (i: number, choice: Choice) =>
    onChange({ ...scene, choices: scene.choices.map((c, k) => (k === i ? choice : c)) })

  return (
    <div className="ed-engine ed-engine-edit" aria-label="Engine">
      <div className="eng-row">
        <span className="eng-key">⚑ when</span>
        <span className="eng-field">
          <input
            aria-label="Condition"
            placeholder="always — or a condition like trust >= 3 and not mara_dead"
            value={scene.condition ?? ''}
            onChange={(e) => onChange({ ...scene, condition: e.target.value === '' ? undefined : e.target.value })}
          />
          {conditionProblem && <span className="eng-problem">{conditionProblem}</span>}
        </span>
      </div>

      {scene.effects.map((effect, i) => {
        const problem = problemsIn(effect.source, 'effect', story)
        return (
          <div key={i} className="eng-row">
            <span className="eng-key">Δ {i === 0 ? 'then' : ''}</span>
            <span className="eng-field">
              <input
                aria-label={`Effect ${i + 1}`}
                placeholder="trust += 1"
                value={effect.source}
                onChange={(e) => setEffect(i, { ...effect, source: e.target.value })}
              />
              {problem && <span className="eng-problem">{problem}</span>}
            </span>
            <select
              aria-label={`Effect ${i + 1} anchor`}
              title="The beat this effect belongs to, for bookkeeping"
              value={effect.anchor ?? ''}
              onChange={(e) => {
                const anchor = e.target.value === '' ? undefined : Number(e.target.value)
                const next: Effect = { source: effect.source }
                if (anchor !== undefined) next.anchor = anchor
                setEffect(i, next)
              }}
            >
              <option value="">no beat</option>
              {scene.beats.map((_, b) => (
                <option key={b} value={b + 1}>
                  at beat {b + 1}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="eng-remove"
              aria-label={`Remove effect ${i + 1}`}
              onClick={() => onChange({ ...scene, effects: scene.effects.filter((_, k) => k !== i) })}
            >
              ✕
            </button>
          </div>
        )
      })}

      <div className="eng-row">
        <span className="eng-key">◔ chance</span>
        <span className="eng-field eng-chance">
          <input
            type="number"
            aria-label="Chance"
            min={0}
            max={100}
            placeholder="—"
            value={scene.chance ?? ''}
            onChange={(e) => onChange({ ...scene, chance: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <span className="eng-unit">% {scene.storylines.length === 0 ? '— a loose scene with a chance is a storylet' : ''}</span>
        </span>
      </div>

      {scene.choices.map((choice, i) => (
        <ChoiceRow
          key={`${i}:${revision}`}
          index={i}
          choice={choice}
          story={story}
          onChange={(next) => setChoice(i, next)}
          onRemove={() => onChange({ ...scene, choices: scene.choices.filter((_, k) => k !== i) })}
          onOpenScene={onOpenScene}
        />
      ))}

      <div className="eng-actions">
        <button type="button" onClick={() => onChange({ ...scene, effects: [...scene.effects, { source: '' }] })}>
          + effect
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...scene, choices: [...scene.choices, { label: '', to: '', effects: [] }] })}
        >
          + choice
        </button>
        {registry.variables.length === 0 && <span className="eng-hint">No variables yet — declare them under Variables.</span>}
      </div>
    </div>
  )
}

function ChoiceRow({
  index,
  choice,
  story,
  onChange,
  onRemove,
  onOpenScene,
}: {
  index: number
  choice: Choice
  story: Story
  onChange: (choice: Choice) => void
  onRemove: () => void
  onOpenScene: (id: Slug) => void
}) {
  const n = index + 1
  const target = story.scenes.get(choice.to)
  const scenes = [...story.scenes.values()].sort((a, b) => a.title.localeCompare(b.title))
  // The effects field is one line of comma-separated effects; the text
  // is held here so a comma being typed isn't normalized away.
  const [effectsText, setEffectsText] = useState(choice.effects.map((e) => e.source).join(', '))
  const conditionProblem = choice.condition === undefined ? undefined : problemsIn(choice.condition, 'condition', story)
  const effectProblems = choice.effects.map((e) => problemsIn(e.source, 'effect', story)).filter((p) => p !== undefined)

  return (
    <div className="eng-choice">
      <div className="eng-row">
        <span className="eng-key">⑂ choice</span>
        <span className="eng-field">
          <input
            aria-label={`Choice ${n} label`}
            placeholder="What the player picks"
            value={choice.label}
            onChange={(e) => onChange({ ...choice, label: e.target.value })}
          />
        </span>
        <span className="eng-key">→</span>
        <select
          aria-label={`Choice ${n} leads to`}
          value={choice.to}
          onChange={(e) => onChange({ ...choice, to: e.target.value })}
        >
          <option value="">— pick a scene —</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        {target ? (
          <button type="button" className="goto" onClick={() => onOpenScene(target.id)}>
            open
          </button>
        ) : (
          choice.to !== '' && <span className="eng-problem">`{choice.to}` doesn’t exist</span>
        )}
        <button type="button" className="eng-remove" aria-label={`Remove choice ${n}`} onClick={onRemove}>
          ✕
        </button>
      </div>
      <div className="eng-row eng-sub">
        <span className="eng-key">when</span>
        <span className="eng-field">
          <input
            aria-label={`Choice ${n} condition`}
            placeholder="always"
            value={choice.condition ?? ''}
            onChange={(e) => {
              const next = { ...choice }
              if (e.target.value === '') delete next.condition
              else next.condition = e.target.value
              onChange(next)
            }}
          />
          {conditionProblem && <span className="eng-problem">{conditionProblem}</span>}
        </span>
        <span className="eng-key">then</span>
        <span className="eng-field">
          <input
            aria-label={`Choice ${n} effects`}
            placeholder="trust += 1, mara_alive = false"
            value={effectsText}
            onChange={(e) => {
              setEffectsText(e.target.value)
              const effects = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s !== '')
                .map((source) => ({ source }))
              onChange({ ...choice, effects })
            }}
          />
          {effectProblems.map((p, k) => (
            <span key={k} className="eng-problem">
              {p}
            </span>
          ))}
        </span>
        <span className="eng-key">◔</span>
        <input
          type="number"
          className="eng-chance-input"
          aria-label={`Choice ${n} chance`}
          min={0}
          max={100}
          placeholder="—"
          value={choice.chance ?? ''}
          onChange={(e) => {
            const next = { ...choice }
            if (e.target.value === '') delete next.chance
            else next.chance = Number(e.target.value)
            onChange(next)
          }}
        />
      </div>
    </div>
  )
}

/** The first thing wrong with an expression, or nothing. */
function problemsIn(source: string, kind: 'condition' | 'effect', story: Story): string | undefined {
  if (source.trim() === '') return undefined
  if (kind === 'condition') {
    const parsed = parseCondition(source)
    if (!parsed.ok) return parsed.error.message
    return checkCondition(parsed.ast, story.registry)[0]
  }
  const parsed = parseEffect(source)
  if (!parsed.ok) return parsed.error.message
  return checkEffect(parsed.ast, story.registry)[0]
}
