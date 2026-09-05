import type { Playthrough, PlaythroughStep, Scene, Slug, Story, VariableState } from '../domain/types'
import { applyEffect, holds, initialState, parseCondition, parseEffect } from './expr'

/**
 * The simulator: a walk through the story, one scene at a time, with the
 * variable state carried along. Entering a scene fires its effects. The
 * ways out of a scene are its choices when it has any (a choice
 * structurally ends a scene), otherwise the next scene along each
 * storyline it sits in; from anywhere, a storylet — a loose scene with a
 * condition or a chance — whose condition holds is also on offer. A way
 * out whose gate is shut is still listed, closed, with the reason, so
 * the writer can see what the player would be missing.
 */

export interface Exit {
  kind: 'choice' | 'continue' | 'storylet'
  label: string
  to: Slug
  available: boolean
  /** Why it's closed, when it is. */
  reason?: string
  chance?: number
  /** For a choice: its index in the scene's list. */
  choice?: number
  /** For a continue: the storyline followed. */
  storyline?: Slug
}

export interface Simulation {
  /** Where the walk stands; undefined once it has ended. */
  scene: Slug | undefined
  state: VariableState
  steps: PlaythroughStep[]
}

/** The first scene of the first storyline — the natural place to begin. */
export function suggestedStart(story: Story): Slug | undefined {
  for (const storyline of story.manifest.storylines) {
    for (const id of storyline.scenes) if (story.scenes.has(id)) return id
  }
  return story.scenes.keys().next().value
}

export function startSimulation(story: Story, start: Slug): Simulation {
  return enter(story, { scene: undefined, state: initialState(story.registry), steps: [] }, start, undefined)
}

/** Steps into a scene: its effects apply, and the step is recorded with the state after them. */
function enter(story: Story, sim: Simulation, id: Slug, choice: string | undefined): Simulation {
  const scene = story.scenes.get(id)
  let state = sim.state
  if (scene) state = applyEffects(scene.effects.map((e) => e.source), state)
  const step: PlaythroughStep = choice === undefined ? { scene: id, state } : { scene: id, choice, state }
  return { scene: id, state, steps: [...sim.steps, step] }
}

function applyEffects(sources: string[], state: VariableState): VariableState {
  for (const source of sources) {
    const parsed = parseEffect(source)
    if (parsed.ok) state = applyEffect(parsed.ast, state)
  }
  return state
}

/** Whether a condition source holds now; an unparseable one never does. */
function gate(source: string | undefined, state: VariableState): { open: boolean; reason?: string } {
  if (source === undefined) return { open: true }
  const parsed = parseCondition(source)
  if (!parsed.ok) return { open: false, reason: `condition can't be read: ${parsed.error.message}` }
  return holds(parsed.ast, state) ? { open: true } : { open: false, reason: `needs ${source}` }
}

export function exits(story: Story, sim: Simulation): Exit[] {
  const list: Exit[] = []
  const here = sim.scene === undefined ? undefined : story.scenes.get(sim.scene)
  if (here) {
    if (here.choices.length > 0) {
      here.choices.forEach((choice, i) => {
        const target = story.scenes.get(choice.to)
        const exit: Exit = { kind: 'choice', label: choice.label, to: choice.to, available: true, choice: i }
        if (choice.chance !== undefined) exit.chance = choice.chance
        if (!target) close(exit, `scene \`${choice.to}\` doesn't exist`)
        else {
          const own = gate(choice.condition, sim.state)
          if (!own.open) close(exit, own.reason)
          else {
            const theirs = gate(target.condition, sim.state)
            if (!theirs.open) close(exit, `${target.title} ${theirs.reason}`)
          }
        }
        list.push(exit)
      })
    } else {
      for (const storyline of story.manifest.storylines) {
        const at = storyline.scenes.indexOf(here.id)
        if (at < 0) continue
        // Walk forward until a scene whose gate is open; the shut ones stay listed.
        for (let i = at + 1; i < storyline.scenes.length; i++) {
          const next = story.scenes.get(storyline.scenes[i])
          if (!next) continue
          const exit: Exit = {
            kind: 'continue',
            label: `Continue along ${storyline.name} to ${next.title}`,
            to: next.id,
            available: true,
            storyline: storyline.id,
          }
          const g = gate(next.condition, sim.state)
          if (!g.open) close(exit, g.reason)
          list.push(exit)
          if (g.open) break
        }
      }
    }
  }
  for (const scene of story.scenes.values()) {
    if (!isStorylet(scene) || scene.id === sim.scene) continue
    if (!gate(scene.condition, sim.state).open) continue
    const exit: Exit = { kind: 'storylet', label: scene.title, to: scene.id, available: true }
    if (scene.chance !== undefined) exit.chance = scene.chance
    list.push(exit)
  }
  return list
}

function close(exit: Exit, reason: string | undefined): void {
  exit.available = false
  exit.reason = reason
}

/** A loose scene carrying a condition or a chance — the storylet pattern. */
export function isStorylet(scene: Scene): boolean {
  return scene.storylines.length === 0 && (scene.condition !== undefined || scene.chance !== undefined)
}

export function take(story: Story, sim: Simulation, exit: Exit): Simulation {
  if (!exit.available) return sim
  let state = sim.state
  let label: string | undefined
  if (exit.kind === 'choice' && sim.scene !== undefined) {
    const choice = story.scenes.get(sim.scene)?.choices[exit.choice as number]
    if (choice) {
      state = applyEffects(choice.effects.map((e) => e.source), state)
      label = choice.label
    }
  }
  return enter(story, { ...sim, state }, exit.to, label)
}

/**
 * Picks one open exit by weight — a chance is a weight out of 100, and
 * an exit with no chance weighs the full 100. `random` is injectable so
 * a roll can be reproduced.
 */
export function roll(story: Story, sim: Simulation, random: () => number = Math.random): Exit | undefined {
  const open = exits(story, sim).filter((e) => e.available)
  if (open.length === 0) return undefined
  const weights = open.map((e) => e.chance ?? 100)
  const total = weights.reduce((a, b) => a + b, 0)
  let at = random() * total
  for (let i = 0; i < open.length; i++) {
    at -= weights[i]
    if (at < 0) return open[i]
  }
  return open[open.length - 1]
}

export function hasEnded(story: Story, sim: Simulation): boolean {
  return !exits(story, sim).some((e) => e.available)
}

export interface Replay {
  sim: Simulation
  /** The first step the story no longer supports, and why. */
  broken?: { step: number; reason: string }
}

/**
 * Re-walks a saved playthrough against the story as it is now. It's a
 * test case: each step must still be reachable the way it was, and the
 * state must come out as recorded.
 */
export function replay(story: Story, playthrough: Playthrough): Replay {
  const [first, ...rest] = playthrough.steps
  if (!first) return { sim: { scene: undefined, state: initialState(story.registry), steps: [] } }
  let sim = startSimulation(story, first.scene)
  const drift = (step: PlaythroughStep, index: number) => {
    const title = story.scenes.get(step.scene)?.title ?? step.scene
    for (const [id, recorded] of Object.entries(step.state)) {
      if (sim.state[id] !== recorded) {
        return { step: index, reason: `At ${title}, ${id} is ${String(sim.state[id])} now; the playthrough recorded ${String(recorded)}` }
      }
    }
    return undefined
  }
  const early = drift(first, 0)
  if (early) return { sim, broken: early }
  for (let i = 0; i < rest.length; i++) {
    const step = rest[i]
    const from = story.scenes.get(sim.scene as Slug)?.title ?? sim.scene
    const to = story.scenes.get(step.scene)?.title ?? step.scene
    const way = exits(story, sim).find(
      (e) => e.available && e.to === step.scene && (step.choice === undefined || e.label === step.choice),
    )
    if (!way) {
      const via = step.choice === undefined ? '' : ` by "${step.choice}"`
      return { sim, broken: { step: i + 1, reason: `No open way from ${from} to ${to}${via}` } }
    }
    sim = take(story, sim, way)
    const drifted = drift(step, i + 1)
    if (drifted) return { sim, broken: drifted }
  }
  return { sim }
}
