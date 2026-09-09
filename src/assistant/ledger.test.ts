import { describe, expect, test } from 'vitest'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { aliasProposals, developmentLines, developmentLog, developmentsFor, hashText, localLedgerStore, modelVerdicts, readSummary, storyOrder, type Ledger, type LedgerEntry } from './ledger'

async function story() {
  const files = embersFiles()
  await files.writeText('characters/rook.md', '---\nid: rook\naliases: [the lifter]\n---\n\n# Rook\n\nA lifter.\n')
  await files.writeText('notes/plan.md', '---\nid: plan\n---\n\n# The Plan\n\nRook goes first.\n')
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded.story
}

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({ hash: 'h', readAt: 1, mentions: [], rejected: [], developments: [], ...over })

describe('the ledger', () => {
  test('a hash tells changed from unchanged and nothing more', () => {
    expect(hashText('Mara watched.')).toBe(hashText('Mara watched.'))
    expect(hashText('Mara watched.')).not.toBe(hashText('Mara watched'))
    expect(hashText('')).toMatch(/^[0-9a-f]{8}-0$/)
  })

  test('lives in page storage per story and survives a refused or broken storage', () => {
    const held = new Map<string, string>()
    const storage = { getItem: (k: string) => held.get(k) ?? null, setItem: (k: string, v: string) => void held.set(k, v) } as unknown as Storage
    const store = localLedgerStore(() => storage)
    expect(store.load('Embers')).toEqual({})
    store.save('Embers', { 'scene:a': entry() })
    expect(store.load('Embers')).toEqual({ 'scene:a': entry() })
    expect(store.load('Other')).toEqual({})
    held.set('storyline-app:ledger:Embers', 'not json')
    expect(store.load('Embers')).toEqual({})
    const refused = localLedgerStore(() => {
      throw new Error('blocked')
    })
    expect(refused.load('Embers')).toEqual({})
    expect(() => refused.save('Embers', {})).not.toThrow()
  })

  test('the summary says when a read ran and what it recorded, or that it recorded nothing', () => {
    const now = 10 * 60_000
    expect(readSummary(undefined, now)).toBeNull()
    expect(readSummary(entry({ readAt: now - 5_000 }), now)).toBe('Read just now: nothing to record')
    expect(
      readSummary(
        entry({
          readAt: now - 3 * 60_000,
          developments: [{ entity: 'character:mara', fact: 'f', quote: 'q' }],
          mentions: [{ quote: 'the smith', entity: 'character:rook' }, { quote: 'her sister', entity: 'character:mara' }],
          rejected: [{ quote: 'Rook', candidate: 'character:rook', why: 'meta' }],
        }),
        now,
      ),
    ).toBe('Read 3 min ago: 1 development, 2 phrases resolved, 1 name ruled out')
    expect(
      readSummary(entry({ readAt: now, notes: [{ kind: 'define', message: 'm', quote: 'q', name: 'the Atacam', defineAs: 'place' }, { kind: 'other', message: 'm', quote: 'q' }] }), now),
    ).toBe('Read just now: 2 editor’s notes, 1 thing to define')
  })

  test("the read's mentions and rejections are the model's verdicts", () => {
    const verdicts = modelVerdicts(
      entry({ mentions: [{ quote: 'the smith', entity: 'character:rook' }], rejected: [{ quote: 'Rook', candidate: 'character:rook', why: 'meta' }] }),
    )
    expect(verdicts).toEqual([
      { quote: 'the smith', entity: 'character:rook', by: 'model' },
      { quote: 'Rook', entity: null, by: 'model' },
    ])
    expect(modelVerdicts(undefined)).toEqual([])
  })

  test('story order is lane order, a shared scene where it first appears, then loose scenes, then notes, then the library', async () => {
    const order = storyOrder(await story()).map((t) => `${t.kind}:${t.id}`)
    expect(order).toEqual([
      'scene:cold-open',
      'scene:the-job-offer',
      'scene:embers',
      'scene:the-dry-cistern',
      'scene:pamphlets',
      'scene:rooftop-duel',
      'note:plan',
      'character:mara',
      'character:rook',
    ])
  })

  test('developments read back in story order, per entity, and the tooltip gets here-then-before', async () => {
    const s = await story()
    const ledger: Ledger = {
      'scene:embers': entry({ developments: [{ entity: 'character:mara', fact: 'Mara opens the Vault.', quote: 'q3' }] }),
      'scene:cold-open': entry({ developments: [{ entity: 'character:mara', fact: 'Mara is at the market.', quote: 'q1' }] }),
      'scene:the-job-offer': entry({
        developments: [
          { entity: 'character:mara', fact: 'Mara takes the job.', quote: 'q2' },
          { entity: 'character:rook', fact: 'Rook offers the job.', quote: 'q2' },
        ],
      }),
    }
    expect(developmentsFor(ledger, s, 'character:mara').map((d) => d.fact)).toEqual(['Mara is at the market.', 'Mara takes the job.', 'Mara opens the Vault.'])
    expect(developmentLog(ledger, s, (key) => s.references.get(key.split(':')[1])?.title).map((row) => [row.title, row.sites.length])).toEqual([
      ['Mara', 3],
      ['Rook', 1],
    ])
    expect(developmentLines(ledger, s, 'character:mara', 'scene:the-job-offer')).toEqual(['Mara takes the job.', 'Before, in Cold Open: Lowmarket: Mara is at the market.'])
    expect(developmentLines(ledger, s, 'character:mara', 'scene:cold-open')).toEqual(['Mara is at the market.'])
    expect(developmentLines(ledger, s, 'character:mara', 'note:plan')).toEqual(['Before, in Ashes or Embers: Mara opens the Vault.'])
  })

  test('an alias is proposed for a noun phrase that names the same thing in two items, unless it is already a name', async () => {
    const s = await story()
    const ledger: Ledger = {
      'scene:cold-open': entry({
        mentions: [
          { quote: 'the door-woman', entity: 'character:mara' },
          { quote: 'she', entity: 'character:mara' },
          { quote: 'The Lifter', entity: 'character:rook' },
          { quote: 'the old man', entity: 'character:rook' },
        ],
      }),
      'scene:embers': entry({ mentions: [{ quote: 'The door-woman', entity: 'character:mara' }, { quote: 'she', entity: 'character:mara' }] }),
      'note:plan': entry({ mentions: [{ quote: 'the old man', entity: 'character:rook' }, { quote: 'Mara', entity: 'character:mara' }] }),
    }
    const proposals = aliasProposals(ledger, s)
    expect(proposals.get('character:mara')).toEqual(['the door-woman'])
    expect(proposals.get('character:rook')).toEqual(['the old man'])
  })
})
