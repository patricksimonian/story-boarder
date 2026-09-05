import { describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { parseSceneFile } from '../files/sceneFile'
import { applySuggestion, liftSuggestions } from './lift'
import { parseTwee, twineToStoryFiles } from './twee'

/**
 * Best-effort lifting of the two constructs worth translating —
 * if-around-a-link and set — from SugarCube and Harlowe into this app's
 * conditions and effects. Suggestions only: each one carries the raw
 * macro it came from, translates into our expression grammar or it
 * isn't offered at all, and nothing changes a file until the writer
 * applies it.
 */

const twee = (body: string, name = 'Cave Mouth') => parseTwee(`:: ${name}\n${body}\n`)

describe('liftSuggestions', () => {
  it('lifts a SugarCube set into a scene effect, declaring its variable', () => {
    const suggestions = liftSuggestions(twee('<<set $torch to true>>\nDark in here.'))
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      scene: 'cave-mouth',
      source: '<<set $torch to true>>',
      apply: { kind: 'scene-effect', effect: 'torch = true' },
      variables: [{ id: 'torch', type: 'boolean', initial: false }],
    })
  })

  it('lifts a numeric set with = and infers a number', () => {
    const suggestions = liftSuggestions(twee('<<set $trust = 2>>'))
    expect(suggestions[0].apply).toEqual({ kind: 'scene-effect', effect: 'trust = 2' })
    expect(suggestions[0].variables).toEqual([{ id: 'trust', type: 'number', initial: 0 }])
  })

  it('lifts an if wrapped around a link into that choice’s condition', () => {
    const suggestions = liftSuggestions(twee('<<if $trust gte 2>>[[Push through->Thicket]]<</if>>'))
    expect(suggestions[0].apply).toEqual({
      kind: 'choice-condition',
      choiceLabel: 'Push through',
      condition: 'trust >= 2',
    })
  })

  it('lifts a setter link into that choice’s effect', () => {
    const suggestions = liftSuggestions(twee('[[Take it|Vault][$hasKey to true]]'))
    expect(suggestions[0].apply).toEqual({ kind: 'choice-effect', choiceLabel: 'Take it', effect: 'hasKey = true' })
  })

  it('speaks Harlowe too: (set:) and (if:) around a link', () => {
    const set = liftSuggestions(twee('(set: $coins to 3)'))
    expect(set[0].apply).toEqual({ kind: 'scene-effect', effect: 'coins = 3' })

    const gated = liftSuggestions(twee('(if: $torch)[[[Go deeper]]]'))
    expect(gated[0].apply).toEqual({ kind: 'choice-condition', choiceLabel: 'Go deeper', condition: 'torch' })
  })

  it('offers nothing for what our grammar cannot say', () => {
    expect(liftSuggestions(twee('<<set $x to $y.pop()>>'))).toEqual([])
    expect(liftSuggestions(twee('<<if visited("Cellar")>>[[Down]]<</if>>'))).toEqual([])
  })
})

describe('applySuggestion', () => {
  async function importedFolder(body: string): Promise<{ files: InMemoryFileAccess; twine: ReturnType<typeof parseTwee> }> {
    const twine = twee(body)
    const files = new InMemoryFileAccess()
    for (const [path, text] of Object.entries(twineToStoryFiles(twine))) {
      await files.writeText(path, text)
    }
    return { files, twine }
  }

  it('writes a lifted condition onto the right choice and declares the variable', async () => {
    const { files, twine } = await importedFolder('<<if $trust gte 2>>[[Push through->Thicket]]<</if>>\n[[Turn back]]')
    const [suggestion] = liftSuggestions(twine)
    await applySuggestion(files, suggestion)

    const result = parseSceneFile('cave-mouth', await files.readText('scenes/cave-mouth.md'))
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.scene.choices.find((c) => c.label === 'Push through')?.condition).toBe('trust >= 2')
    expect(result.scene.choices.find((c) => c.label === 'Turn back')?.condition).toBeUndefined()

    const registry = JSON.parse(await files.readText('variables.json')) as { variables: { id: string }[] }
    expect(registry.variables).toEqual([{ id: 'trust', type: 'number', initial: 0 }])
  })

  it('appends a scene effect and never declares a variable twice', async () => {
    const { files, twine } = await importedFolder('<<set $torch to true>>\n<<set $torch to false>>')
    const suggestions = liftSuggestions(twine)
    expect(suggestions).toHaveLength(2)
    for (const suggestion of suggestions) await applySuggestion(files, suggestion)

    const result = parseSceneFile('cave-mouth', await files.readText('scenes/cave-mouth.md'))
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.scene.effects.map((e) => e.source)).toEqual(['torch = true', 'torch = false'])

    const registry = JSON.parse(await files.readText('variables.json')) as { variables: { id: string }[] }
    expect(registry.variables).toHaveLength(1)
  })
})
