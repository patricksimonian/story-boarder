import { useState } from 'react'
import type { Health } from '../assistant/health'
import { DEFAULT_PROMPTS, MODEL_CHOICES, type AssistantSettings, type Prompts } from '../assistant/settings'
import type { StoryManifest, StorySettings } from '../domain/types'

/**
 * Settings: the story's own, everything in story.json with the title
 * first; and Claude Code, a switch with a health check behind it, the
 * model, and the prompts the reads and checks use. Each pane holds its
 * edits until its own Save; Cancel puts back what the files hold.
 */
export function SettingsView({
  manifest,
  onSaveStory,
  assistant,
  prompts,
  health,
  onCheck,
  onSaveAssistant,
  runnerKind,
}: {
  manifest: StoryManifest
  onSaveStory: (title: string, settings: StorySettings) => void
  assistant: AssistantSettings
  prompts: Prompts
  health: Health
  /** Runs the health check with this model; the status line follows it. */
  onCheck: (model: string) => void
  onSaveAssistant: (settings: AssistantSettings, prompts: Prompts) => void
  runnerKind: 'desktop' | 'browser' | 'none'
}) {
  return (
    <section className="hist-wrap" role="region" aria-label="Settings">
      <div className="view-bar">
        <h2>Settings</h2>
        <span className="view-sub">the story's own, then Claude Code — nothing lands until you save a pane</span>
      </div>
      {/* Each pane is keyed on what the files hold, so a save or an outside edit starts it over from the file. */}
      <StoryPane key={`${manifest.title}\n${JSON.stringify(manifest.settings)}`} manifest={manifest} onSave={onSaveStory} />
      <ClaudePane
        key={`${assistant.enabled}\n${assistant.model}\n${prompts.readScene}\n${prompts.checkContinuity}`}
        assistant={assistant}
        prompts={prompts}
        health={health}
        onCheck={onCheck}
        onSave={onSaveAssistant}
        runnerKind={runnerKind}
      />
    </section>
  )
}

function StoryPane({ manifest, onSave }: { manifest: StoryManifest; onSave: (title: string, settings: StorySettings) => void }) {
  const held = JSON.stringify(manifest.settings, null, 2)
  const [title, setTitle] = useState(manifest.title)
  const [json, setJson] = useState(held)

  let parsed: StorySettings | null = null
  let problem: string | null = null
  try {
    const value: unknown = JSON.parse(json)
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as StorySettings
    else problem = 'Settings must be a JSON object.'
  } catch (error) {
    problem = `Not valid JSON: ${(error as Error).message}`
  }
  const dirty = title !== manifest.title || json !== held

  return (
    <div className="settings-pane" aria-label="Story settings">
      <h3>Story</h3>
      <div className="sync-form">
        <label>
          Title
          <input aria-label="Story title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Everything else in story.json settings
          <textarea aria-label="Settings JSON" className="settings-json" rows={10} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        </label>
        {problem && (
          <p className="settings-problem" role="alert">
            {problem}
          </p>
        )}
      </div>
      {dirty && (
        <div className="settings-savebar">
          <button type="button" disabled={parsed === null || title.trim() === ''} onClick={() => parsed && onSave(title.trim(), parsed)}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setTitle(manifest.title)
              setJson(held)
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function ClaudePane({
  assistant,
  prompts,
  health,
  onCheck,
  onSave,
  runnerKind,
}: {
  assistant: AssistantSettings
  prompts: Prompts
  health: Health
  onCheck: (model: string) => void
  onSave: (settings: AssistantSettings, prompts: Prompts) => void
  runnerKind: 'desktop' | 'browser' | 'none'
}) {
  const [enabled, setEnabled] = useState(assistant.enabled)
  const [model, setModel] = useState(assistant.model)
  const [readScene, setReadScene] = useState(prompts.readScene)
  const [checkContinuity, setCheckContinuity] = useState(prompts.checkContinuity)

  const dirty =
    enabled !== assistant.enabled || model !== assistant.model || readScene !== prompts.readScene || checkContinuity !== prompts.checkContinuity
  const custom = !MODEL_CHOICES.some((c) => c.value === model)

  const statusWord = health.kind === 'checking' ? 'Checking Claude' : health.kind === 'passed' ? 'Passed' : health.kind === 'error' ? 'Error' : 'Off'
  const statusDetail = health.kind === 'passed' ? health.detail : health.kind === 'error' ? health.reason : ''

  return (
    <div className="settings-pane" aria-label="Claude Code settings">
      <h3>Claude Code</h3>
      <p className="view-note">
        Coaching reads your scenes and checks your storylines through the Claude Code you are signed into. Nothing else leaves the machine.
        {runnerKind === 'browser' && ' In a browser the app reaches it through the helper: run pnpm assistant at the project and leave it running.'}
        {runnerKind === 'none' && ' This build has no way to reach Claude Code.'}
      </p>
      <div className="sync-form">
        <label className="settings-switch">
          <input
            type="checkbox"
            role="switch"
            aria-label="Coaching"
            checked={enabled}
            disabled={runnerKind === 'none'}
            onChange={(e) => {
              setEnabled(e.target.checked)
              if (e.target.checked) onCheck(model)
            }}
          />
          Coaching
        </label>
        {(enabled || health.kind !== 'idle') && (
          <p className={`settings-health ${health.kind}`} role="status">
            <strong>{statusWord}</strong>
            {statusDetail && <span> — {statusDetail}</span>}
            {enabled && health.kind === 'error' && (
              <button type="button" className="goto" onClick={() => onCheck(model)}>
                Check again
              </button>
            )}
          </p>
        )}
        <label>
          Model
          <select
            aria-label="Model"
            value={custom ? 'custom' : model}
            disabled={!enabled}
            onChange={(e) => {
              if (e.target.value === 'custom') return
              setModel(e.target.value)
              onCheck(e.target.value)
            }}
          >
            {MODEL_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
            {custom && <option value="custom">{model} (from story.json)</option>}
          </select>
        </label>
        <PromptField label="Read prompt" name="readScene" value={readScene} fallback={DEFAULT_PROMPTS.readScene} disabled={!enabled} onChange={setReadScene} />
        <PromptField
          label="Continuity prompt"
          name="checkContinuity"
          value={checkContinuity}
          fallback={DEFAULT_PROMPTS.checkContinuity}
          disabled={!enabled}
          onChange={setCheckContinuity}
        />
      </div>
      {dirty && (
        <div className="settings-savebar">
          <button type="button" onClick={() => onSave({ enabled, model }, { readScene, checkContinuity })}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEnabled(assistant.enabled)
              setModel(assistant.model)
              setReadScene(prompts.readScene)
              setCheckContinuity(prompts.checkContinuity)
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function PromptField({
  label,
  name,
  value,
  fallback,
  disabled,
  onChange,
}: {
  label: string
  name: string
  value: string
  fallback: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="settings-promptlabel">
        {label}
        {value !== fallback && (
          <button type="button" className="goto" disabled={disabled} aria-label={`Reset ${label.toLowerCase()} to default`} onClick={() => onChange(fallback)}>
            Reset to default
          </button>
        )}
      </span>
      <textarea aria-label={label} name={name} className="settings-prompt" rows={8} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
