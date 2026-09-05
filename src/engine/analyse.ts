import type { Scene, Slug, Story, Variable } from '../domain/types'
import { checkCondition, checkEffect, holds, initialState, parseCondition, parseEffect, variablesRead, type Expr } from './expr'
import { isStorylet } from './simulate'

/**
 * Static analysis: what the story promises that it can't keep. It runs
 * on the loaded story, never on the files, and everything it says is
 * something the writer can act on — a scene to open, a variable to set.
 *
 * The "can never" findings rest on one sound test: a condition whose
 * variables no effect ever assigns keeps its initial value forever, so
 * if it is false at the start it is false always. Anything an effect
 * touches is left alone — deciding that needs a run, and that's what the
 * simulator is for.
 */

export type Severity = 'error' | 'warning' | 'note'

export type FindingKind =
  | 'expression'
  | 'dangling'
  | 'dead-branch'
  | 'unreachable'
  | 'never-set'
  | 'never-read'
  | 'missing-reference'

export interface Finding {
  severity: Severity
  kind: FindingKind
  message: string
  /** The scene to open, when there is one. */
  scene?: Slug
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, note: 2 }

export function analyse(story: Story): Finding[] {
  const findings: Finding[] = []
  const { registry, scenes, references } = story
  const initial = initialState(registry)

  // Every variable each effect assigns, and each condition reads.
  const assigned = new Set<string>()
  const read = new Set<string>()
  const effectsOf = (scene: Scene) => [
    ...scene.effects.map((e) => e.source),
    ...scene.choices.flatMap((c) => c.effects.map((e) => e.source)),
  ]
  for (const scene of scenes.values()) {
    for (const source of effectsOf(scene)) {
      const parsed = parseEffect(source)
      if (parsed.ok) assigned.add(parsed.ast.target)
    }
    for (const source of [scene.condition, ...scene.choices.map((c) => c.condition)]) {
      if (source === undefined) continue
      const parsed = parseCondition(source)
      if (parsed.ok) for (const id of variablesRead(parsed.ast, registry)) read.add(id)
    }
  }

  /** Why a condition can never hold, or undefined when it might. */
  const neverHolds = (source: string): string | undefined => {
    const parsed = parseCondition(source)
    if (!parsed.ok) return undefined
    const vars = [...variablesRead(parsed.ast, registry)]
    if (vars.length === 0 || vars.some((v) => assigned.has(v))) return undefined
    if (holds(parsed.ast, initial)) return undefined
    const frozen = vars.map((v) => `${v} from ${String(initial[v])}`).join(' or ')
    return `it needs \`${source}\`, and no effect ever changes ${frozen}`
  }

  for (const scene of scenes.values()) {
    const at = (severity: Severity, kind: FindingKind, message: string) =>
      findings.push({ severity, kind, scene: scene.id, message })

    // Expressions that don't read or don't check against the registry.
    const conditions: [string, string | undefined][] = [
      ['Condition', scene.condition],
      ...scene.choices.map((c): [string, string | undefined] => [`Choice "${c.label}" condition`, c.condition]),
    ]
    for (const [where, source] of conditions) {
      if (source === undefined) continue
      for (const problem of checkSource(source, parseCondition, (ast) => checkCondition(ast, registry))) {
        at('error', 'expression', `${where} \`${source}\`: ${problem}`)
      }
    }
    const effects: [string, string][] = [
      ...scene.effects.map((e): [string, string] => ['Effect', e.source]),
      ...scene.choices.flatMap((c) => c.effects.map((e): [string, string] => [`Choice "${c.label}" effect`, e.source])),
    ]
    for (const [where, source] of effects) {
      for (const problem of checkSource(source, parseEffect, (ast) => checkEffect(ast, registry))) {
        at('error', 'expression', `${where} \`${source}\`: ${problem}`)
      }
    }

    // Choices: where they lead, and whether they can ever be taken.
    for (const choice of scene.choices) {
      if (!scenes.has(choice.to)) {
        at('error', 'dangling', `Choice "${choice.label}" leads to \`${choice.to}\`, which doesn’t exist`)
        continue
      }
      const why = choice.condition === undefined ? undefined : neverHolds(choice.condition)
      if (why) at('warning', 'dead-branch', `Choice "${choice.label}" can never be taken: ${why}`)
    }

    // The scene's own gate.
    if (scene.condition !== undefined) {
      const why = neverHolds(scene.condition)
      if (why) at('warning', 'unreachable', `${scene.title} can never fire: ${why}`)
    } else if (isStorylet(scene) && scene.chance === 0) {
      at('warning', 'unreachable', `${scene.title} has a chance of 0, so it never fires`)
    }

    // Characters the reference library doesn't know.
    for (const id of scene.characters) {
      if (!references.has(id)) at('note', 'missing-reference', `Character \`${id}\` has no file under characters/`)
    }
  }

  for (const variable of registry.variables) {
    findings.push(...variableFindings(variable, assigned.has(variable.id), read.has(variable.id)))
  }

  return findings.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}

function variableFindings(variable: Variable, isSet: boolean, isRead: boolean): Finding[] {
  if (!isSet && !isRead) return [{ severity: 'note', kind: 'never-set', message: `\`${variable.id}\` is never set and never read` }]
  if (!isSet) return [{ severity: 'note', kind: 'never-set', message: `\`${variable.id}\` is read by a condition but no effect ever sets it` }]
  if (!isRead) return [{ severity: 'note', kind: 'never-read', message: `\`${variable.id}\` is set by effects but no condition ever reads it` }]
  return []
}

function checkSource<T>(
  source: string,
  parse: (source: string) => { ok: true; ast: T } | { ok: false; error: { message: string } },
  check: (ast: T) => string[],
): string[] {
  const parsed = parse(source)
  if (!parsed.ok) return [parsed.error.message]
  return check(parsed.ast)
}

/** Parsed conditions, for callers that already know the source is fine. */
export function conditionAst(source: string): Expr | undefined {
  const parsed = parseCondition(source)
  return parsed.ok ? parsed.ast : undefined
}
