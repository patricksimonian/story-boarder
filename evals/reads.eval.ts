// @vitest-environment node
/**
 * Evals for the read: the real Claude Code, the real briefings, fixtures
 * with expectations, each run several times, and a pass rate per
 * expectation at the end. This spends the writer's usage, so it is not
 * part of `pnpm test`; run it with `pnpm eval:coach` (EVAL_RUNS, EVAL_MODEL,
 * EVAL_ONLY to narrow). An expectation passes the eval when it holds in
 * at least EVAL_MIN of EVAL_RUNS runs (default 2 of 3): a read is a
 * model's judgement and one miss in three is noise, two is a fault.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { spawnClaude } from '../scripts/assistant.mjs'
import type { FileAccess, ProcessRunner } from '../src/adapters/types'
import { type LedgerEntry } from '../src/assistant/ledger'
import { ledgerEntryFrom, readSceneRequest, type ReadSceneOutput } from '../src/assistant/readScene'
import { run } from '../src/assistant/runner'
import type { Story, TargetKey } from '../src/domain/types'
import { dictionary } from '../src/mentions/match'
import { loadStory } from '../src/story/loadStory'

const RUNS = Number(process.env.EVAL_RUNS ?? 3)
const MIN = Number(process.env.EVAL_MIN ?? Math.ceil((RUNS * 2) / 3))
const MODEL = process.env.EVAL_MODEL ?? 'haiku'
const ONLY = process.env.EVAL_ONLY

interface Expectation {
  name: string
  holds: (entry: LedgerEntry, story: Story) => boolean
}

interface Case {
  name: string
  folder: string
  item: TargetKey
  expectations: Expectation[]
}

const here = resolve(import.meta.dirname ?? '.')
const CASES: Case[] = [
  {
    name: 'Mara’s Confession: the Warden has no page, and Mara develops',
    folder: resolve(here, '../.scratch/storyline-app/sample-story/EmbersOfTheVault'),
    item: 'scene:maras-confession',
    expectations: [
      { name: 'defines the Warden (no page in the library)', holds: (e) => e.notes?.some((n) => n.kind === 'define' && !n.entity && /warden/i.test(n.name ?? '')) ?? false },
      { name: 'records at least one development about Mara', holds: (e) => e.developments.some((d) => d.entity === 'character:mara') },
      { name: 'does not define Mara, Rook, or the Vault (they have pages)', holds: (e) => !e.notes?.some((n) => n.kind === 'define' && !n.entity && /^(mara|rook|the vault)$/i.test(n.name ?? '')) },
    ],
  },
  {
    name: 'The salt queen: a title the library gives another way is a mention of Queen Ilsabet',
    folder: resolve(here, 'fixtures/salt-road'),
    item: 'note:the-foundling',
    expectations: [
      { name: 'resolves "the salt queen" to Queen Ilsabet', holds: (e) => e.mentions.some((m) => /salt queen/i.test(m.quote) && m.entity === 'character:queen-ilsabet') },
      { name: 'does not flag the salt queen as undefined', holds: (e) => !e.notes?.some((n) => n.kind === 'define' && !n.entity && /salt queen/i.test(n.name ?? '')) },
      { name: 'defines the Drowned Choir (no page)', holds: (e) => e.notes?.some((n) => n.kind === 'define' && !n.entity && /drowned choir/i.test(n.name ?? '')) ?? false },
    ],
  },
  {
    name: 'The Tide Bell: a character, a place, a rite, and a piece of state the story does not have yet',
    folder: resolve(here, 'fixtures/salt-road'),
    item: 'scene:the-tide-bell',
    expectations: [
      { name: 'defines Brother Halvard as a character', holds: (e) => defined(e, /halvard/i, 'character') },
      { name: 'defines the Glasswater marsh as a place', holds: (e) => defined(e, /glasswater/i, 'place') },
      { name: 'defines the Rite of Brine as lore', holds: (e) => defined(e, /rite of brine/i, 'lore') },
      {
        name: 'proposes a variable for the bell or the closed crossing',
        holds: (e) => e.notes?.some((n) => n.kind === 'define' && n.defineAs === 'variable' && !!n.variable && /bell|crossing/i.test(`${n.variable.id} ${n.message}`)) ?? false,
      },
      { name: 'does not define Teodor or Marrow Point (they have pages)', holds: (e) => !e.notes?.some((n) => n.kind === 'define' && !n.entity && /^(teodor|marrow point)$/i.test(n.name ?? '')) },
    ],
  },
  {
    name: 'The Oath: a yes/no the reader answers is state; a fact from the start is not',
    folder: resolve(here, 'fixtures/salt-road'),
    item: 'note:the-oath',
    expectations: [
      { name: 'proposes a variable for the answer to "can you keep a secret?"', holds: (e) => proposes(e, /keep\w*_?(the_|a_)?secret|secret_kept|promis|oath|answer/i) },
      {
        name: 'notes that both answers lead to the same line',
        holds: (e) => e.notes?.some((n) => (n.kind === 'loose-end' || n.kind === 'other') && /secret|answer|choice|yes/i.test(`${n.message} ${n.quote ?? ''}`)) ?? false,
      },
      { name: 'does not propose a variable for Teodor never knowing his parents', holds: (e) => !proposes(e, /parent|father|mother|lineage|heritage|upbringing|(?<!bell.?)origin/i) },
    ],
  },
  {
    name: 'The Gull: a choice with effects written in the prose is engine logic; being tired is not a variable; an unreached beat is not continuity',
    folder: resolve(here, 'fixtures/salt-road'),
    item: 'scene:the-gull',
    expectations: [
      { name: 'flags the two options as a choice written in the prose', holds: (e) => e.notes?.some((n) => n.kind === 'engine' && /option|choice|choos|pick/i.test(`${n.message} ${n.quote}`)) ?? false },
      { name: "proposes a variable for the gull's trust", holds: (e) => proposes(e, /gull/i) },
      { name: 'does not propose a variable for Teodor being tired', holds: (e) => !proposes(e, /tired|fatigue|weary|exhaust|sleep|rest|mood|energy/i) },
      { name: 'does not file the unreached harbourmaster beat as continuity', holds: (e) => !e.notes?.some((n) => n.kind === 'continuity' && /harbourmaster|mooring|beat|synopsis/i.test(`${n.message} ${n.against?.quote ?? ''}`)) },
    ],
  },
]

/** A variable proposal, on a define note or an engine note, whose id or name matches; the message is left out, since it quotes the page and would match on any word in it. */
function proposes(e: LedgerEntry, about: RegExp): boolean {
  return e.notes?.some((n) => (n.kind === 'define' || n.kind === 'engine') && n.defineAs === 'variable' && !!n.variable && about.test(`${n.variable.id} ${n.name ?? ''}`)) ?? false
}

/** A define note naming the thing, as that kind; the kind may be missing when the model did not say. */
function defined(e: LedgerEntry, name: RegExp, as: string): boolean {
  return e.notes?.some((n) => n.kind === 'define' && !n.entity && name.test(n.name ?? '') && (n.defineAs === undefined || n.defineAs === as)) ?? false
}

function diskFiles(root: string): FileAccess {
  const at = (p: string) => join(root, p)
  const exists = (p: string) => {
    try {
      statSync(at(p))
      return true
    } catch {
      return false
    }
  }
  return {
    async readText(p) {
      return readFileSync(at(p), 'utf8')
    },
    async writeText(p, c) {
      mkdirSync(join(at(p), '..'), { recursive: true })
      writeFileSync(at(p), c)
    },
    async readBinary(p) {
      return new Uint8Array(readFileSync(at(p)))
    },
    async writeBinary() {},
    async list(dir) {
      if (!exists(dir)) return []
      return readdirSync(at(dir))
        .filter((n) => statSync(at(join(dir, n))).isFile())
        .map((n) => (dir ? `${dir}/${n}` : n))
    },
    async listFolders(dir) {
      if (!exists(dir)) return []
      return readdirSync(at(dir))
        .filter((n) => statSync(at(join(dir, n))).isDirectory())
        .map((n) => (dir ? `${dir}/${n}` : n))
    },
    async exists(p) {
      return exists(p)
    },
    async delete() {},
  }
}

/** The writer's own Claude Code, spawned the way the helper spawns it, with no server between. */
const runner: ProcessRunner = {
  kind: 'browser',
  spawnClaude: (run, opts) => spawnClaude(run, opts),
  status: async () => ({ kind: 'ready', detail: 'eval' }),
  auth: async () => ({ kind: 'signed-in' }),
}

const results: { case: string; expectation: string; passes: number; runs: number; ok: boolean }[] = []
const seen: Record<string, LedgerEntry[]> = {}

describe('the read, for real', () => {
  for (const c of CASES) {
    if (ONLY && !c.name.toLowerCase().includes(ONLY.toLowerCase())) continue
    test(
      c.name,
      async () => {
        const loaded = await loadStory(diskFiles(c.folder))
        if (!loaded.ok) throw new Error(loaded.reason)
        const { story } = loaded.loaded
        const dict = dictionary(story)
        const entries: LedgerEntry[] = []
        for (let i = 0; i < RUNS; i++) {
          const request = readSceneRequest(story, c.item, dict, {})
          if (!request) throw new Error(`no request for ${c.item}`)
          const t0 = Date.now()
          const result = await run<ReadSceneOutput>(runner, request, { model: MODEL })
          const entry = ledgerEntryFrom(result.output, request.briefing, dict, Date.now(), c.item)
          entries.push(entry)
          const defined = (entry.notes ?? []).filter((n) => n.kind === 'define' && !n.entity).map((n) => `${n.name}${n.defineAs ? ` (${n.defineAs})` : ''}`)
          console.log(
            `  run ${i + 1}: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${entry.mentions.length} mentions, ${entry.developments.length} developments, ${entry.notes?.length ?? 0} notes; defines: ${defined.join('; ') || '—'}`,
          )
        }
        seen[c.name] = entries
        const failures: string[] = []
        for (const e of c.expectations) {
          const passes = entries.filter((entry) => e.holds(entry, story)).length
          const ok = passes >= MIN
          results.push({ case: c.name, expectation: e.name, passes, runs: RUNS, ok })
          console.log(`  ${ok ? 'PASS' : 'FAIL'} ${passes}/${RUNS}  ${e.name}`)
          if (!ok) failures.push(`${e.name}: ${passes}/${RUNS}`)
        }
        mkdirSync(join(here, 'results'), { recursive: true })
        writeFileSync(join(here, 'results', 'last-run.json'), JSON.stringify({ model: MODEL, runs: RUNS, min: MIN, results, seen }, null, 2))
        expect(failures, `expectations under ${MIN}/${RUNS}`).toEqual([])
      },
      RUNS * 120_000,
    )
  }
})
