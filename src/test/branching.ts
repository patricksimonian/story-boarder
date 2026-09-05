import { InMemoryFileAccess, InMemoryJournal, ManualWatcher } from '../adapters/stubs'
import type { OpenedFolder, Platform } from '../adapters/types'
import { loadStory, type LoadedStory } from '../story/loadStory'

/**
 * A small branching story for the engine: a main storyline with a real
 * choice, a rumours storyline with a gated scene, two storylets in the
 * pool (one that can fire, one whose gate nothing ever opens), a dead
 * branch, a choice to a scene nobody wrote, and one expression with a
 * typo. Every static-analysis finding has a home here.
 */

function scene(id: string, fm: string, title: string, synopsis: string): string {
  return `---\nid: ${id}\n${fm}---\n\n# ${title}\n\n## Synopsis\n\n${synopsis}\n\n## Beats\n\n1. Something shifts.\n`
}

export function branchingFiles(): InMemoryFileAccess {
  const files = new InMemoryFileAccess()
  const write = (path: string, text: string) => void files.writeText(path, text)

  write(
    'story.json',
    JSON.stringify({
      title: 'The Vault',
      acts: [
        { id: 'act-1', title: 'Act I' },
        { id: 'act-2', title: 'Act II' },
      ],
      storylines: [
        { id: 'main', name: 'The Heist', color: '#5b6ee1', glyph: '◆', scenes: ['offer', 'door', 'ending'] },
        { id: 'rumours', name: 'Rumours', color: '#2fa08d', glyph: '▲', scenes: ['pamphlets', 'uprising'] },
      ],
      settings: {},
    }),
  )
  write(
    'variables.json',
    JSON.stringify({
      variables: [
        { id: 'trust', type: 'number', initial: 0 },
        { id: 'mara_alive', type: 'boolean', initial: true },
        { id: 'rebellion_strength', type: 'number', initial: 0 },
        { id: 'visited_undercity', type: 'boolean', initial: false },
        { id: 'city_mood', type: 'enum', values: ['calm', 'tense', 'rioting'], initial: 'calm' },
        { id: 'unused', type: 'number', initial: 0 },
      ],
    }),
  )
  write(
    'scenes/offer.md',
    scene(
      'offer',
      'storylines: [main]\nact: act-1\neffects: [trust += 1]\nchoices:\n  - label: Take the job\n    to: door\n  - label: Refuse\n    to: refusal\n    condition: city_mood == rioting\n',
      'The Offer',
      'Dax lays out the job.',
    ),
  )
  write(
    'scenes/door.md',
    scene(
      'door',
      'storylines: [main]\nact: act-2\nchoices:\n  - label: Trust Mara\n    to: ending\n    condition: trust >= 1\n    effects: [mara_alive = true, trust += 1]\n  - label: Seal it\n    to: ending\n    effects: [mara_alive = false, trust = 0]\n',
      'The Vault Door',
      'Two hands or one.',
    ),
  )
  write(
    'scenes/ending.md',
    scene('ending', 'storylines: [main]\nact: act-2\nchoices:\n  - label: Epilogue\n    to: epilogue\n', 'Ashes or Embers', 'What the Vault held.'),
  )
  write('scenes/refusal.md', scene('refusal', '', 'Walking Away', 'Rook leaves the Brass Lamp.'))
  write('scenes/pamphlets.md', scene('pamphlets', 'storylines: [rumours]\nact: act-1\neffects: [rebellion_strength += 1]\n', 'Pamphlets', 'Sedition in print.'))
  write('scenes/uprising.md', scene('uprising', 'storylines: [rumours]\nact: act-2\ncondition: rebellion_strength >= 2\n', 'The Uprising', 'The underhive rises.'))
  write('scenes/chapel.md', scene('chapel', 'condition: visited_undercity\nchance: 30\n', 'The Drowned Chapel', 'A storylet under the water line.'))
  write('scenes/whisper.md', scene('whisper', 'condition: trust >= 2\nchance: 50\n', 'A Whisper', 'Mara says something she should not.'))
  write('scenes/typo.md', scene('typo', 'condition: trusst >= 1\n', 'The Typo', 'A gate with a misspelt variable.'))
  return files
}

export async function branchingStory(): Promise<LoadedStory> {
  const result = await loadStory(branchingFiles())
  if (!result.ok) throw new Error(result.reason)
  return result.loaded
}

export interface BranchingWorld {
  platform: Platform
  files: InMemoryFileAccess
}

/** A platform whose picker always opens The Vault. */
export function branchingWorld(): BranchingWorld {
  const files = branchingFiles()
  const folder: OpenedFolder = { name: 'TheVault', files, watcher: new ManualWatcher(), journal: new InMemoryJournal() }
  return {
    files,
    platform: {
      pickFolder: async () => folder,
      recents: async () => [],
      openRecent: async () => folder,
      rememberOpened: async () => {},
    },
  }
}
