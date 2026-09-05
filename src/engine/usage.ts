import type { Slug, Story } from '../domain/types'
import { parseCondition, parseEffect, variablesRead } from './expr'

/**
 * The variable ledger: for every declared variable, each place an
 * effect writes it and each place a condition reads it. This is the
 * whole life of a variable made visible — the two halves that turn a
 * declared name into a working part of the story.
 */

export interface UsageSite {
  scene: Slug
  sceneTitle: string
  /** The expression as written. */
  source: string
  /** Where in the scene it sits, in words: 'effect', 'condition', 'choice "X" effect', 'choice "X" gate'. */
  via: string
}

export interface VariableUsage {
  writes: UsageSite[]
  reads: UsageSite[]
}

export function variableUsage(story: Story): Map<string, VariableUsage> {
  const map = new Map<string, VariableUsage>(story.registry.variables.map((v) => [v.id, { writes: [], reads: [] }]))
  for (const scene of story.scenes.values()) {
    const site = (source: string, via: string): UsageSite => ({ scene: scene.id, sceneTitle: scene.title, source, via })
    const write = (source: string, via: string) => {
      const parsed = parseEffect(source)
      if (parsed.ok) map.get(parsed.ast.target)?.writes.push(site(source, via))
    }
    const read = (source: string, via: string) => {
      const parsed = parseCondition(source)
      if (parsed.ok) for (const id of variablesRead(parsed.ast, story.registry)) map.get(id)?.reads.push(site(source, via))
    }
    for (const effect of scene.effects) write(effect.source, 'effect')
    if (scene.condition !== undefined) read(scene.condition, 'condition')
    for (const choice of scene.choices) {
      if (choice.condition !== undefined) read(choice.condition, `choice "${choice.label}" gate`)
      for (const effect of choice.effects) write(effect.source, `choice "${choice.label}" effect`)
    }
  }
  return map
}
