import { useState } from 'react'
import type { Slug, Story, Variable, VariableRegistry } from '../domain/types'
import { analyse } from '../engine/analyse'
import { variableUsage, type UsageSite } from '../engine/usage'

/**
 * The registry: every variable the story can read or change. Only what's
 * declared here exists, so this is where a typo in a condition gets its
 * answer. Ids are stable — renaming one would mean rewriting every
 * expression that names it, which is a find-and-replace the writer can
 * see, not a silent rewrite.
 */
export function VariablesView({
  story,
  onSave,
  onOpenScene,
}: {
  story: Story
  onSave: (registry: VariableRegistry) => void
  onOpenScene: (id: Slug) => void
}) {
  const { registry } = story
  const notes = analyse(story).filter((f) => f.kind === 'never-set' || f.kind === 'never-read')
  const noteFor = (id: string) => notes.find((n) => n.message.startsWith(`\`${id}\``))?.message
  const usage = variableUsage(story)

  const [id, setId] = useState('')
  const [type, setType] = useState<Variable['type']>('number')
  const [values, setValues] = useState('')
  const [error, setError] = useState<string | null>(null)

  const replace = (variable: Variable) =>
    onSave({ variables: registry.variables.map((v) => (v.id === variable.id ? variable : v)) })

  const add = () => {
    const trimmed = id.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      setError('An id is letters, digits, and underscores, and starts with a letter or underscore.')
      return
    }
    if (registry.variables.some((v) => v.id === trimmed)) {
      setError(`\`${trimmed}\` is already declared.`)
      return
    }
    let variable: Variable
    if (type === 'boolean') variable = { id: trimmed, type, initial: false }
    else if (type === 'number') variable = { id: trimmed, type, initial: 0 }
    else {
      const list = values
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== '')
      if (list.length === 0) {
        setError('An enum needs at least one value.')
        return
      }
      variable = { id: trimmed, type, values: list, initial: list[0] }
    }
    setError(null)
    setId('')
    setValues('')
    onSave({ variables: [...registry.variables, variable] })
  }

  return (
    <section className="vars-wrap" role="region" aria-label="Variables">
      <div className="view-bar">
        <h2>Variables</h2>
        <span className="view-sub">
          {registry.variables.length === 0
            ? 'Nothing declared yet. Conditions and effects can only name variables declared here.'
            : 'The registry behind every condition and effect — variables.json.'}
        </span>
      </div>
      {registry.variables.length > 0 && (
        <table className="vars-table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Type</th>
              <th>Initial</th>
              <th>Values</th>
              <th>Means</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {registry.variables.map((v) => (
              <tr key={v.id}>
                <td>
                  <code>{v.id}</code>
                </td>
                <td>{v.type}</td>
                <td>
                  {v.type === 'boolean' && (
                    <label className="vars-check">
                      <input
                        type="checkbox"
                        aria-label={`${v.id} initial`}
                        checked={v.initial}
                        onChange={(e) => replace({ ...v, initial: e.target.checked })}
                      />
                      {v.initial ? 'true' : 'false'}
                    </label>
                  )}
                  {v.type === 'number' && (
                    <input
                      type="number"
                      aria-label={`${v.id} initial`}
                      value={v.initial}
                      onChange={(e) => replace({ ...v, initial: Number(e.target.value) })}
                    />
                  )}
                  {v.type === 'enum' && (
                    <select aria-label={`${v.id} initial`} value={v.initial} onChange={(e) => replace({ ...v, initial: e.target.value })}>
                      {v.values.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  {v.type === 'enum' && (
                    <EnumValues variable={v} onChange={(next) => replace(next)} />
                  )}
                </td>
                <td>
                  <DescriptionField key={v.id} variable={v} onCommit={(description) => replace(description === '' ? stripDescription(v) : { ...v, description })} />
                </td>
                <td className="vars-note">{noteFor(v.id)}</td>
                <td>
                  <button type="button" className="danger-link" aria-label={`Delete variable ${v.id}`} onClick={() => onSave({ variables: registry.variables.filter((x) => x.id !== v.id) })}>
                    delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="vars-add">
        <h3>Declare a variable</h3>
        <div className="vars-add-row">
          <input aria-label="New variable id" placeholder="" value={id} onChange={(e) => setId(e.target.value)} />
          <select aria-label="New variable type" value={type} onChange={(e) => setType(e.target.value as Variable['type'])}>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="enum">enum</option>
          </select>
          {type === 'enum' && (
            <input
              aria-label="New variable values"
              placeholder="calm, tense, rioting"
              value={values}
              onChange={(e) => setValues(e.target.value)}
            />
          )}
          <button type="button" disabled={id.trim() === ''} onClick={add}>
            Add variable
          </button>
        </div>
        {error && <p className="eng-problem">{error}</p>}
        <p className="view-note">
          A number starts at 0, a boolean at false, an enum at its first value; change the initial in the table.
          Deleting a variable leaves the expressions that name it as written — Analysis will point at them.
        </p>
      </div>
      {registry.variables.length > 0 && (
        <div className="vars-add">
          <h3>The ledger — where each variable lives</h3>
          <p className="view-note">
            A variable has exactly two moving parts. An <strong>effect writes it</strong> when its scene fires or its
            choice is taken; a <strong>condition reads it</strong> to open or shut whatever it sits on. Nothing else
            touches a variable — and one missing either half is inert.
          </p>
          {registry.variables.map((v) => {
            const u = usage.get(v.id) ?? { writes: [], reads: [] }
            return (
              <div key={v.id} role="group" aria-label={`Ledger for ${v.id}`} className="mt-3">
                <div>
                  <code>{v.id}</code>
                  {v.description !== undefined && <span className="ml-2 opacity-70">{v.description}</span>}
                </div>
                <LedgerLine
                  label="Set by"
                  sites={u.writes}
                  empty="nothing — no effect sets it, so it keeps its initial value forever"
                  onOpenScene={onOpenScene}
                />
                <LedgerLine
                  label="Read by"
                  sites={u.reads}
                  empty="nothing — no condition reads it, so the story never asks what it holds"
                  onOpenScene={onOpenScene}
                />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function LedgerLine({
  label,
  sites,
  empty,
  onOpenScene,
}: {
  label: string
  sites: UsageSite[]
  empty: string
  onOpenScene: (id: Slug) => void
}) {
  return (
    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 pl-4">
      <span className="text-sm opacity-70">{label}:</span>
      {sites.length === 0 && <em className="text-sm">{empty}</em>}
      {sites.map((site, i) => (
        <button
          key={i}
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm underline"
          onClick={() => onOpenScene(site.scene)}
        >
          {site.sceneTitle} — {site.via} `{site.source}`
        </button>
      ))}
    </div>
  )
}

/** Removes the description without disturbing the typed arms of the union. */
function stripDescription(variable: Variable): Variable {
  const { description: _description, ...rest } = variable
  return rest as Variable
}

/** Held as local text, committed on Enter or on leaving the field — a keystroke never rewrites the file. */
function DescriptionField({ variable, onCommit }: { variable: Variable; onCommit: (description: string) => void }) {
  const [text, setText] = useState(variable.description ?? '')
  const commit = () => {
    if (text.trim() !== (variable.description ?? '')) onCommit(text.trim())
  }
  return (
    <input
      aria-label={`${variable.id} description`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

function EnumValues({ variable, onChange }: { variable: Variable & { type: 'enum' }; onChange: (v: Variable) => void }) {
  const [text, setText] = useState(variable.values.join(', '))
  return (
    <input
      aria-label={`${variable.id} values`}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const values = e.target.value
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '')
        if (values.length === 0) return
        onChange({ ...variable, values, initial: values.includes(variable.initial) ? variable.initial : values[0] })
      }}
    />
  )
}
