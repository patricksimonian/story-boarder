import type { FileAccess } from '../adapters/types'
import type { Scene, Slug } from '../domain/types'
import { serializeSceneFile } from '../files/sceneFile'
import { startStory, writeManifest } from './mutations'

/**
 * Starter templates: scaffolds for a fresh folder, and nothing more. A
 * template writes ordinary acts, storylines, scenes, and variables the
 * writer renames, reworks, or deletes like anything else — the app
 * never knows a story came from one.
 */

export interface Template {
  id: string
  name: string
  blurb: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'three-act',
    name: 'Three-act',
    blurb: 'Setup, confrontation, resolution — one spine, a seed scene in each act.',
  },
  {
    id: 'branch-and-bottleneck',
    name: 'Branch and bottleneck',
    blurb: 'A fork the player takes, paths that live apart, one scene where they must rejoin.',
  },
  {
    id: 'storylet-pool',
    name: 'Storylet pool',
    blurb: 'Loose scenes gated by conditions, surfacing whenever the state says they can.',
  },
]

function seed(id: Slug, over: Partial<Scene> & { title: string }): Scene {
  return {
    id,
    storylines: [],
    tags: [],
    characters: [],
    images: [],
    effects: [],
    choices: [],
    synopsis: '',
    beats: [],
    prose: '',
    ...over,
  }
}

/** Starts a story in a bare folder — from a template when one is named, bare otherwise. */
export async function applyTemplate(files: FileAccess, title: string, templateId: string | undefined): Promise<void> {
  if (templateId === 'three-act') return threeAct(files, title)
  if (templateId === 'branch-and-bottleneck') return branchAndBottleneck(files, title)
  if (templateId === 'storylet-pool') return storyletPool(files, title)
  return startStory(files, title)
}

async function writeScenes(files: FileAccess, scenes: Scene[]): Promise<void> {
  for (const scene of scenes) await files.writeText(`scenes/${scene.id}.md`, serializeSceneFile(scene))
}

async function threeAct(files: FileAccess, title: string): Promise<void> {
  await writeScenes(files, [
    seed('the-opening', {
      title: 'The Opening',
      storylines: ['spine'],
      act: 'act-1',
      synopsis: 'Where the ordinary world shows itself — and the crack in it.',
    }),
    seed('the-turn', {
      title: 'The Turn',
      storylines: ['spine'],
      act: 'act-2',
      synopsis: 'The middle carries the weight: the plan meets the world and bends.',
    }),
    seed('the-resolution', {
      title: 'The Resolution',
      storylines: ['spine'],
      act: 'act-3',
      synopsis: 'What the whole story was for. Land it.',
    }),
  ])
  await writeManifest(files, {
    title,
    acts: [
      { id: 'act-1', title: 'Act I — Setup' },
      { id: 'act-2', title: 'Act II — Confrontation' },
      { id: 'act-3', title: 'Act III — Resolution' },
    ],
    storylines: [
      { id: 'spine', name: 'The Spine', color: '#5b6ee1', glyph: '◆', scenes: ['the-opening', 'the-turn', 'the-resolution'] },
    ],
    settings: {},
  })
}

async function branchAndBottleneck(files: FileAccess, title: string): Promise<void> {
  await writeScenes(files, [
    seed('the-fork', {
      title: 'The Fork',
      storylines: ['spine'],
      act: 'act-1',
      synopsis: 'One scene, two doors. The choices below are the branch — rename them, regate them.',
      choices: [
        { label: 'The daring way', to: 'the-daring-way', effects: [] },
        { label: 'The careful way', to: 'the-careful-way', effects: [] },
      ],
    }),
    seed('the-daring-way', {
      title: 'The Daring Way',
      storylines: ['branches'],
      act: 'act-1',
      synopsis: 'A branch lives its own life for a while…',
      choices: [{ label: 'On to the meeting point', to: 'the-bottleneck', effects: [] }],
    }),
    seed('the-careful-way', {
      title: 'The Careful Way',
      storylines: ['branches'],
      act: 'act-1',
      synopsis: '…and so does the other.',
      choices: [{ label: 'On to the meeting point', to: 'the-bottleneck', effects: [] }],
    }),
    seed('the-bottleneck', {
      title: 'The Bottleneck',
      storylines: ['spine'],
      act: 'act-2',
      synopsis: 'Every path leads here, whatever was chosen — the story narrows so it can breathe again.',
    }),
  ])
  await writeManifest(files, {
    title,
    acts: [
      { id: 'act-1', title: 'Act I — The Fork' },
      { id: 'act-2', title: 'Act II — The Meeting Point' },
    ],
    storylines: [
      { id: 'spine', name: 'The Spine', color: '#5b6ee1', glyph: '◆', scenes: ['the-fork', 'the-bottleneck'] },
      { id: 'branches', name: 'The Branches', color: '#2fa08d', glyph: '▲', scenes: ['the-daring-way', 'the-careful-way'] },
    ],
    settings: {},
  })
}

async function storyletPool(files: FileAccess, title: string): Promise<void> {
  await writeScenes(files, [
    seed('a-new-day', {
      title: 'A New Day',
      storylines: ['days'],
      act: 'act-1',
      synopsis: 'The anchor: each pass through here raises the tension the storylets read.',
      effects: [{ source: 'tension += 1' }],
    }),
    seed('a-quiet-favor', {
      title: 'A Quiet Favor',
      synopsis: 'A storylet: loose, gated, on offer from anywhere while the town is calm.',
      condition: 'tension < 2',
    }),
    seed('a-knock-at-night', {
      title: 'A Knock at Night',
      synopsis: 'A storylet that only exists once things are strained — and not every time, either.',
      condition: 'tension >= 2',
      chance: 50,
    }),
  ])
  await files.writeText(
    'variables.json',
    JSON.stringify({ variables: [{ id: 'tension', type: 'number', initial: 0 }] }, null, 2) + '\n',
  )
  await writeManifest(files, {
    title,
    acts: [{ id: 'act-1', title: 'Ongoing' }],
    storylines: [{ id: 'days', name: 'The Days', color: '#cf9c4a', glyph: '●', scenes: ['a-new-day'] }],
    settings: {},
  })
}
