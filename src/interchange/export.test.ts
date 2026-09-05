import { describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { collectSource, exportPlayable, playableToStoryFiles, renderPlayable } from './export'

/**
 * The playable export copies Twine's compile model: one HTML file — a
 * template with the title, the runtime JS, and the story as JSON in a
 * script island, `<` escaped so no prose can break out of it. A second,
 * inert island carries the story folder's files verbatim, which is what
 * makes every export losslessly re-importable.
 */

const SOURCE = {
  'story.json': '{ "title": "Embers of the Vault", "acts": [], "storylines": [], "settings": {} }',
  'scenes/cold-open.md': '---\nid: cold-open\n---\n\n# Cold Open\n\n## Prose\n\nSneaky </script> tag here.\n',
}

describe('renderPlayable', () => {
  it('builds one HTML file: title, story island, source island, runtime', () => {
    const html = renderPlayable('Embers of the Vault', '{"manifest":{}}', SOURCE, 'console.log("runtime")')
    expect(html).toContain('<title>Embers of the Vault</title>')
    expect(html).toContain('<meta charset="utf-8"')
    expect(html).toContain('id="story-data"')
    expect(html).toContain('id="storyline-source"')
    expect(html).toContain('console.log("runtime")')
  })

  it('keeps script-breaking text inert in both islands', () => {
    const html = renderPlayable('X', JSON.stringify({ prose: 'Sneaky </script> tag' }), SOURCE, '')
    // The only closing script tags are the template's own.
    const inIslands = html.split('<script type="application/json"').slice(1)
    for (const island of inIslands) {
      const body = island.slice(island.indexOf('>') + 1, island.indexOf('</script>'))
      expect(body).not.toContain('</script')
      expect(body).not.toContain('<!--')
    }
  })
})

describe('the re-import island', () => {
  it('hands back the exact files that went in', () => {
    const html = renderPlayable('Embers of the Vault', '{}', SOURCE, '')
    expect(playableToStoryFiles(html)).toEqual(SOURCE)
  })

  it('reads nothing from ordinary HTML', () => {
    expect(playableToStoryFiles('<html><body>plain page</body></html>')).toBeNull()
  })
})

describe('collectSource and exportPlayable', () => {
  it('collects every file except the repository and prior exports', async () => {
    const files = new InMemoryFileAccess()
    for (const [path, text] of Object.entries(SOURCE)) await files.writeText(path, text)
    await files.writeText('.git/HEAD', 'ref: refs/heads/main\n')
    await files.writeText('.git/objects/aa/bb', 'x')
    await files.writeText('exports/older.html', '<!doctype html>')

    expect(await collectSource(files)).toEqual(SOURCE)
  })

  it('exports a story folder end to end, and the export re-imports losslessly', async () => {
    const files = new InMemoryFileAccess()
    for (const [path, text] of Object.entries(SOURCE)) await files.writeText(path, text)

    const result = await exportPlayable(files, '/* runtime */')
    if (!result.ok) throw new Error(result.reason)
    expect(result.name).toBe('embers-of-the-vault')
    expect(result.html).toContain('<title>Embers of the Vault</title>')

    const story = JSON.parse(
      result.html.match(/id="story-data"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? 'null',
    ) as { manifest: { title: string }; scenes: { id: string; prose: string }[] }
    expect(story.manifest.title).toBe('Embers of the Vault')
    expect(story.scenes[0]).toMatchObject({ id: 'cold-open' })
    expect(story.scenes[0].prose).toContain('Sneaky </script> tag here.')

    expect(playableToStoryFiles(result.html)).toEqual(SOURCE)
  })

  it('declines a folder that is not a story', async () => {
    const files = new InMemoryFileAccess()
    await files.writeText('notes.txt', 'no story here')
    const result = await exportPlayable(files, '')
    expect(result.ok).toBe(false)
  })
})
