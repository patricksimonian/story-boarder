import type { FileAccess } from '../adapters/types'
import type { Slug, Variable, VariableRegistry } from '../domain/types'
import { parseCondition, parseEffect } from '../engine/expr'
import { parseSceneFile, serializeSceneFile } from '../files/sceneFile'
import { linksOf, passageSlugs, type TwineStory } from './twee'

/**
 * Best-effort lifting of Twine macros into this app's engine — the two
 * constructs worth translating: an if wrapped around a link becomes a
 * choice condition, a set becomes an effect (a setter link, that
 * choice's effect). Each candidate is translated into our expression
 * grammar and offered only if it parses there; anything else stays
 * prose. These are suggestions: the raw macro rides along, and nothing
 * touches a file until the writer applies one.
 */

export type LiftApply =
  | { kind: 'scene-effect'; effect: string }
  | { kind: 'choice-condition'; choiceLabel: string; condition: string }
  | { kind: 'choice-effect'; choiceLabel: string; effect: string }

export interface LiftSuggestion {
  scene: Slug
  /** What the writer reads in the list. */
  description: string
  /** The raw macro this came from, verbatim. */
  source: string
  apply: LiftApply
  /** Variables the expression names, typed by inference, declared on apply if missing. */
  variables: Variable[]
}

export function liftSuggestions(twine: TwineStory): LiftSuggestion[] {
  const slugs = passageSlugs(twine)
  const suggestions: LiftSuggestion[] = []

  for (const passage of twine.passages) {
    const scene = slugs.get(passage.name) as Slug
    const offer = (source: string, apply: LiftApply, expression: string) => {
      suggestions.push({
        scene,
        source,
        apply,
        variables: inferVariables(expression),
        description: describeApply(apply),
      })
    }

    // A set on its own: <<set $x to 1>> / <<set $x += 1>> / (set: $x to 1)
    for (const match of passage.body.matchAll(/<<set\s+(.+?)>>|\(set:\s*(.+?)\)/g)) {
      const inner = match[1] ?? match[2]
      const effect = translateSet(inner)
      if (effect !== null) offer(match[0], { kind: 'scene-effect', effect }, effect)
    }

    // An if wrapped around one link: <<if COND>>[[link]]<</if>> / (if: COND)[ [[link]] ]
    const gated = [
      ...passage.body.matchAll(/<<if\s+(.+?)>>\s*(\[\[[^\]]*\](?:\[[^\]]*\])?\])\s*<<\/if>>/g),
      ...passage.body.matchAll(/\(if:\s*(.+?)\)\[\s*(\[\[[^\]]*\]\])\s*\]/g),
    ]
    for (const match of gated) {
      const condition = translateExpr(match[1])
      const link = linksOf(match[2])[0]
      if (link && parseCondition(condition).ok) {
        offer(match[0], { kind: 'choice-condition', choiceLabel: link.label, condition }, condition)
      }
    }

    // Setter links: the trailing [expression] is that choice's effect.
    for (const link of linksOf(passage.body)) {
      if (link.setter === undefined) continue
      const effect = translateSet(link.setter)
      if (effect !== null) {
        offer(`[[${link.label}|${link.target}][${link.setter}]]`, { kind: 'choice-effect', choiceLabel: link.label, effect }, effect)
      }
    }
  }

  return suggestions
}

function describeApply(apply: LiftApply): string {
  switch (apply.kind) {
    case 'scene-effect':
      return `When the scene fires: ${apply.effect}`
    case 'choice-condition':
      return `Gate “${apply.choiceLabel}” with: ${apply.condition}`
    case 'choice-effect':
      return `“${apply.choiceLabel}” applies: ${apply.effect}`
  }
}

/** `$x to 1` / `$x = 1` / `$x += 1` → our effect string, or null when our grammar can't say it. */
function translateSet(inner: string): string | null {
  const match = inner.trim().match(/^\$(\w+)\s*(to|=|\+=|-=)\s*(.+)$/s)
  if (!match) return null
  const effect = `${match[1]} ${match[2] === 'to' ? '=' : match[2]} ${translateExpr(match[3])}`
  return parseEffect(effect).ok ? effect : null
}

/** SugarCube/Harlowe spellings into ours; whatever survives must still parse. */
function translateExpr(raw: string): string {
  return raw
    .replace(/\$(\w+)/g, '$1')
    .replace(/\bgte\b/g, '>=')
    .replace(/\bgt\b/g, '>')
    .replace(/\blte\b/g, '<=')
    .replace(/\blt\b/g, '<')
    .replace(/\beq\b/g, '==')
    .replace(/\bneq\b/g, '!=')
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/\s+/g, ' ')
    .trim()
}

const KEYWORDS = new Set(['and', 'or', 'not', 'is', 'true', 'false'])

/**
 * Typed by how the expression uses each name: compared or assigned a
 * boolean literal → boolean, a number → number. A name only mentioned
 * bare is a boolean. Quoted strings would make an enum whose values we
 * can't know — those declare nothing and stay the writer's call.
 */
function inferVariables(expression: string): Variable[] {
  const vars = new Map<string, Variable>()
  const typed = (name: string, literal: string) => {
    if (KEYWORDS.has(name) || vars.has(name)) return
    if (literal === 'true' || literal === 'false') vars.set(name, { id: name, type: 'boolean', initial: false })
    else if (/^-?[\d.]/.test(literal)) vars.set(name, { id: name, type: 'number', initial: 0 })
  }
  for (const match of expression.matchAll(
    /\b(\w+)\s*(?:==|!=|>=|<=|>|<|\+=|-=|=|is not|is)\s*(-?\d+(?:\.\d+)?|true|false|"[^"]*"|'[^']*')/g,
  )) {
    typed(match[1], match[2])
  }
  for (const word of expression.match(/\b[A-Za-z_]\w*\b/g) ?? []) {
    if (!KEYWORDS.has(word) && !vars.has(word) && !/^\d/.test(word)) {
      vars.set(word, { id: word, type: 'boolean', initial: false })
    }
  }
  return [...vars.values()]
}

/** Writes one accepted suggestion: the scene file changes, missing variables get declared. */
export async function applySuggestion(files: FileAccess, suggestion: LiftSuggestion): Promise<void> {
  const path = `scenes/${suggestion.scene}.md`
  const parsed = parseSceneFile(suggestion.scene, await files.readText(path))
  if (!parsed.ok) return
  const scene = parsed.scene

  const apply = suggestion.apply
  if (apply.kind === 'scene-effect') {
    scene.effects = [...scene.effects, { source: apply.effect }]
  } else {
    scene.choices = scene.choices.map((choice) =>
      choice.label === apply.choiceLabel
        ? apply.kind === 'choice-condition'
          ? { ...choice, condition: apply.condition }
          : { ...choice, effects: [...choice.effects, { source: apply.effect }] }
        : choice,
    )
  }
  await files.writeText(path, serializeSceneFile(scene))

  const registry: VariableRegistry = (await files.exists('variables.json'))
    ? (JSON.parse(await files.readText('variables.json')) as VariableRegistry)
    : { variables: [] }
  const missing = suggestion.variables.filter((v) => !registry.variables.some((r) => r.id === v.id))
  if (missing.length > 0) {
    registry.variables = [...registry.variables, ...missing]
    await files.writeText('variables.json', JSON.stringify(registry, null, 2))
  }
}
