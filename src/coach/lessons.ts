import type { Story } from '../domain/types'
import { variableUsage } from '../engine/usage'

/**
 * The coach: a walkthrough that checks itself against the loaded story.
 * A lesson is done when the story actually contains the thing — the
 * tutorial is a quest log, and the story is the save file. Nothing here
 * writes; the writer does the writing, in the ordinary views.
 */

export interface Lesson {
  id: string
  title: string
  /** Why this matters, coach's voice. */
  why: string
  /** Where to do it, in this app's own geography. */
  how: string
}

export interface CheckedLesson extends Lesson {
  done: boolean
  /** What satisfied the lesson, in the story's own terms. */
  evidence?: string
}

export const LESSONS: Lesson[] = [
  {
    id: 'declare',
    title: 'Declare a variable',
    why: 'A variable is a fact the story remembers — a count, a yes-or-no, a mood. Only declared variables exist; a condition naming anything else is a typo the app can catch.',
    how: 'Variables view → Declare a variable. A number for things that accumulate, a boolean for things that happened or didn’t, an enum for a handful of named states.',
  },
  {
    id: 'write',
    title: 'Write it with an effect',
    why: 'A declared variable never moves on its own. An effect is the only pen: it fires when its scene is entered, or when its choice is taken.',
    how: 'Open a scene → engine block → add an effect like `plants_saved += 1`, or put the effect on a choice so only that road writes it.',
  },
  {
    id: 'read',
    title: 'Read it with a condition',
    why: 'A condition is the only reader: it opens or shuts whatever it sits on — a scene, a choice, a loose storylet. Writing without reading is a diary nobody opens.',
    how: 'On the scene or choice that should depend on the past, set a condition like `plants_saved >= 3`.',
  },
  {
    id: 'loop',
    title: 'Close a loop',
    why: 'The whole engine is this one shape: an effect somewhere earlier, a condition somewhere later, the same variable in both. Cause in one scene, consequence in another — even in another storyline, because variables are story-global.',
    how: 'Have at least one variable that some effect sets and some condition reads. The ledger in the Variables view shows both halves of every variable.',
  },
  {
    id: 'fork',
    title: 'Give the player a fork',
    why: 'A choice structurally ends its scene: once a scene has any choice, every way out must be one. Two choices to the same next scene is the quiet trade; two choices to different scenes is the branch.',
    how: 'In a scene’s engine block, add two choices. Give one of them an effect, and you’ve built a fork that remembers.',
  },
  {
    id: 'walk',
    title: 'Walk it, and save the walk',
    why: 'The simulator is where the wiring becomes a story: gates open and shut in front of you, and the live state shows every write as it lands. A saved playthrough replays forever as a test of what you built.',
    how: 'Simulate view → start anywhere → take exits → Save the playthrough under a name.',
  },
]

export interface PatternCard {
  name: string
  gist: string
  /** Where to see it working, in the Embers sample. */
  inEmbers?: string
}

export const PATTERNS: PatternCard[] = [
  {
    name: 'The counter and the gate',
    gist: 'Small kindnesses accumulate in a number (`+= 1` on choices), and a later scene or choice asks for enough of them (`>= 3`). The count is the story’s memory of a habit, not an event.',
    inEmbers: 'Act IV: Tanner’s Row and The Orphan Mill write a4_hearths_lit; The Warm Welcome asks for it.',
  },
  {
    name: 'The variant scene',
    gist: 'A conditional moment isn’t an if inside prose — it’s its own small gated scene placed before the destination. The lane walks past a shut gate to the first open scene, so the destination stays ungated.',
    inEmbers: 'The Warm Welcome sits gated before The Road North, which always happens.',
  },
  {
    name: 'The cross-arc read',
    gist: 'Variables are story-global: written in one storyline, read in another. The two lanes never mention each other — the variable is the only thread, and it’s enough.',
    inEmbers: 'Kindling writes a4_hearths_lit; Smoke Over Lowmarket, in The Thaw, reads it.',
  },
  {
    name: 'Time as an enum',
    gist: 'The engine has no clock. Declare `time_of_day: [day, dusk, night]`, move it with effects at scene boundaries, and gate night-things on it. “You were late” is just a boolean some branch sets.',
  },
  {
    name: 'A boolean per plot item',
    gist: 'There is no inventory, and the story doesn’t need one. `has_potion = true` when it’s obtained, a condition where it matters. Model the facts the story will test, not the backpack.',
  },
  {
    name: 'The storylet pool',
    gist: 'A loose scene with a condition (and maybe a chance) is on offer from anywhere its gate is open. A pool of them over shared state is a world that reacts without a fixed plot.',
    inEmbers: 'The Drowned Chapel and A Whisper in the branching demo; the storylet-pool starter template scaffolds the shape.',
  },
]

export function checkLessons(story: Story): CheckedLesson[] {
  const usage = variableUsage(story)
  const declared = story.registry.variables

  const firstWrite = [...usage.entries()].find(([, u]) => u.writes.length > 0)
  const firstRead = [...usage.entries()].find(([, u]) => u.reads.length > 0)
  const looped = [...usage.entries()].find(([, u]) => u.writes.length > 0 && u.reads.length > 0)
  const fork = [...story.scenes.values()].find((s) => s.choices.length >= 2)
  const playthrough = story.playthroughs[0]

  const results: Record<string, { done: boolean; evidence?: string }> = {
    declare: declared.length
      ? { done: true, evidence: `\`${declared[0].id}\` is declared${declared.length > 1 ? `, and ${declared.length - 1} more` : ''}` }
      : { done: false },
    write: firstWrite
      ? { done: true, evidence: `${firstWrite[1].writes[0].sceneTitle} sets \`${firstWrite[1].writes[0].source}\`` }
      : { done: false },
    read: firstRead
      ? { done: true, evidence: `${firstRead[1].reads[0].sceneTitle} asks \`${firstRead[1].reads[0].source}\`` }
      : { done: false },
    loop: looped
      ? { done: true, evidence: `\`${looped[0]}\` is written and read — a working loop` }
      : { done: false },
    fork: fork ? { done: true, evidence: `${fork.title} offers ${fork.choices.length} choices` } : { done: false },
    walk: playthrough ? { done: true, evidence: `“${playthrough.name}” is saved and replayable` } : { done: false },
  }

  return LESSONS.map((lesson) => ({ ...lesson, ...results[lesson.id] }))
}
