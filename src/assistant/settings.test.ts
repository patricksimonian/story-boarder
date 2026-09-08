import { describe, expect, test } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import type { StoryManifest } from '../domain/types'
import { CONTINUITY_RUBRIC } from './continuity'
import { READ_SCENE_RUBRIC } from './readScene'
import { assistantSettings, loadPrompts, savePrompts, withAssistant } from './settings'

const manifest = (settings: Record<string, unknown>): StoryManifest => ({ title: 'T', acts: [], storylines: [], settings })

describe('assistant settings in story.json', () => {
  test('off with haiku unless the manifest says otherwise, and written back beside the other settings', () => {
    expect(assistantSettings(manifest({}))).toEqual({ enabled: false, model: 'haiku' })
    expect(assistantSettings(manifest({ assistant: { enabled: true, model: ' sonnet ' } }))).toEqual({ enabled: true, model: 'sonnet' })
    expect(assistantSettings(manifest({ assistant: { enabled: 'yes', model: '' } }))).toEqual({ enabled: false, model: 'haiku' })
    const next = withAssistant(manifest({ sync: { owner: 'p', repo: 'r' } }), { enabled: true, model: 'opus' })
    expect(next.settings).toEqual({ sync: { owner: 'p', repo: 'r' }, assistant: { enabled: true, model: 'opus' } })
  })
})

describe('the prompt files', () => {
  test('missing or empty means the default; saved ones are read back trimmed', async () => {
    const files = new InMemoryFileAccess()
    expect(await loadPrompts(files)).toEqual({ readScene: READ_SCENE_RUBRIC, checkContinuity: CONTINUITY_RUBRIC })
    await files.writeText('coach/read-scene.md', '   \n')
    expect((await loadPrompts(files)).readScene).toBe(READ_SCENE_RUBRIC)

    await savePrompts(files, { readScene: 'Read it my way.\n', checkContinuity: '' })
    expect(await files.readText('coach/read-scene.md')).toBe('Read it my way.\n')
    expect(await files.readText('coach/check-continuity.md')).toBe(`${CONTINUITY_RUBRIC}\n`)
    expect(await loadPrompts(files)).toEqual({ readScene: 'Read it my way.', checkContinuity: CONTINUITY_RUBRIC })
  })
})
