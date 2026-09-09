import type { FileAccess } from '../adapters/types'
import type { StoryManifest } from '../domain/types'
import { CONTINUITY_RUBRIC } from './continuity'
import { READ_SCENE_RUBRIC } from './readScene'

/**
 * What story.json carries about coaching, and the prompt files beside it.
 * The switch and the model travel with the story; the health check never
 * does — it is what this machine says right now.
 */
export interface AssistantSettings {
  enabled: boolean
  /** An alias Claude Code accepts after --model, or a full model name. */
  model: string
  /** Whether a save is followed by a read once typing rests. Off by default: a read costs. */
  autoRead: boolean
}

export const DEFAULT_MODEL = 'haiku'

/** The aliases Claude Code resolves to the newest of each family. */
export const MODEL_CHOICES: { value: string; label: string }[] = [
  { value: 'haiku', label: 'Haiku — fastest and cheapest; enough for reads' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'fable', label: 'Fable' },
]

export function assistantSettings(manifest: StoryManifest): AssistantSettings {
  const raw = manifest.settings.assistant as Partial<AssistantSettings> | undefined
  return {
    enabled: raw?.enabled === true,
    model: typeof raw?.model === 'string' && raw.model.trim() !== '' ? raw.model.trim() : DEFAULT_MODEL,
    autoRead: raw?.autoRead === true,
  }
}

export function withAssistant(manifest: StoryManifest, settings: AssistantSettings): StoryManifest {
  return {
    ...manifest,
    settings: { ...manifest.settings, assistant: { enabled: settings.enabled, model: settings.model, autoRead: settings.autoRead } },
  }
}

export interface Prompts {
  readScene: string
  checkContinuity: string
}

export const PROMPT_FILES: Record<keyof Prompts, string> = {
  readScene: 'coach/read-scene.md',
  checkContinuity: 'coach/check-continuity.md',
}

export const DEFAULT_PROMPTS: Prompts = { readScene: READ_SCENE_RUBRIC, checkContinuity: CONTINUITY_RUBRIC }

/** The prompts as the folder holds them; an empty or missing file is the default. */
export async function loadPrompts(files: FileAccess): Promise<Prompts> {
  const prompts = { ...DEFAULT_PROMPTS }
  for (const key of Object.keys(PROMPT_FILES) as (keyof Prompts)[]) {
    const path = PROMPT_FILES[key]
    if (!(await files.exists(path))) continue
    const text = await files.readText(path).catch(() => '')
    if (text.trim() !== '') prompts[key] = text.trim()
  }
  return prompts
}

/** Writes both prompt files, so they are there to edit outside the app too. */
export async function savePrompts(files: FileAccess, prompts: Prompts): Promise<void> {
  for (const key of Object.keys(PROMPT_FILES) as (keyof Prompts)[]) {
    const text = prompts[key].trim() === '' ? DEFAULT_PROMPTS[key] : prompts[key].trim()
    await files.writeText(PROMPT_FILES[key], `${text}\n`)
  }
}
