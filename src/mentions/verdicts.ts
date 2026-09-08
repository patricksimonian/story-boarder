import type { Slug, TargetKey, Verdict, VerdictStore } from '../domain/types'

export type { TargetKey, Verdict, VerdictStore }

/**
 * Verdicts: decisions about what a phrase means inside one item. They
 * are keyed by text, never by position, because offsets move with every
 * edit and a phrase does not. `mentions.json` at the story root holds
 * the writer's own; the model's arrive with the ledger and stay out of
 * the story folder. A verdict applies to every occurrence of its phrase
 * in its item.
 */

export const MENTIONS_PATH = 'mentions.json'

export const targetKey = (target: { kind: string; id: Slug }): TargetKey => `${target.kind}:${target.id}`

export function parseTargetKey(key: TargetKey): { kind: string; id: Slug } | undefined {
  const at = key.indexOf(':')
  if (at <= 0 || at === key.length - 1) return undefined
  return { kind: key.slice(0, at), id: key.slice(at + 1) }
}

export type VerdictParseResult = { ok: true; store: VerdictStore } | { ok: false; problems: string[] }

export function parseVerdicts(text: string): VerdictParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { ok: false, problems: [`Not valid JSON: ${(error as Error).message}`] }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, problems: ['mentions.json must be an object keyed by item'] }
  }
  const store: VerdictStore = {}
  const problems: string[] = []
  for (const [item, list] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(list)) {
      problems.push(`\`${item}\` must hold a list of verdicts`)
      continue
    }
    const verdicts: Verdict[] = []
    list.forEach((raw, i) => {
      const v = raw as Partial<Verdict> | null
      if (!v || typeof v !== 'object' || typeof v.quote !== 'string' || v.quote.trim() === '') {
        problems.push(`\`${item}\` verdict ${i + 1} has no quote`)
        return
      }
      if (v.entity !== null && (typeof v.entity !== 'string' || parseTargetKey(v.entity) === undefined)) {
        problems.push(`\`${item}\` verdict "${v.quote}" names no entity (expected \`kind:id\` or null)`)
        return
      }
      verdicts.push({ quote: v.quote, entity: v.entity ?? null, by: v.by === 'model' ? 'model' : 'writer' })
    })
    if (verdicts.length) store[item] = verdicts
  }
  return problems.length ? { ok: false, problems } : { ok: true, store }
}

export function serializeVerdicts(store: VerdictStore): string {
  const ordered: VerdictStore = {}
  for (const item of Object.keys(store).sort()) if (store[item].length) ordered[item] = store[item]
  return `${JSON.stringify(ordered, null, 2)}\n`
}

/** Two quotes are the same phrase when they differ only in case, curly quotes, or a possessive. */
export function samePhrase(a: string, b: string): boolean {
  return phraseKey(a) === phraseKey(b)
}

export function phraseKey(quote: string): string {
  return quote
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'s$|'$/, '')
    .replace(/\s+/g, ' ')
}

/** The store with one verdict set for an item; an earlier verdict on the same phrase is replaced. */
export function withVerdict(store: VerdictStore, item: TargetKey, verdict: Verdict): VerdictStore {
  const kept = (store[item] ?? []).filter((v) => !samePhrase(v.quote, verdict.quote))
  return { ...store, [item]: [...kept, verdict] }
}

export function withoutVerdict(store: VerdictStore, item: TargetKey, quote: string): VerdictStore {
  const kept = (store[item] ?? []).filter((v) => !samePhrase(v.quote, quote))
  const next = { ...store }
  if (kept.length) next[item] = kept
  else delete next[item]
  return next
}
