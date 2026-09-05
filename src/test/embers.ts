import { InMemoryFileAccess, InMemoryJournal, ManualWatcher } from '../adapters/stubs'
import type { OpenedFolder, Platform } from '../adapters/types'

/**
 * A miniature Embers of the Vault: three storylines, two acts, a scene
 * shared across non-adjacent lanes (heist + rebellion, with mara between),
 * one pool scene, one malformed file.
 */

function scene(id: string, fm: string, title: string, synopsis: string): string {
  return `---\nid: ${id}\n${fm}---\n\n# ${title}\n\n## Synopsis\n\n${synopsis}\n\n## Beats\n\n1. Something shifts.\n2. It cannot shift back.\n`
}

export function embersFiles(): InMemoryFileAccess {
  const files = new InMemoryFileAccess()
  const write = (path: string, text: string) => void files.writeText(path, text)

  write(
    'story.json',
    JSON.stringify({
      title: 'Embers of the Vault',
      acts: [
        { id: 'act-1', title: 'Act I — The Spark' },
        { id: 'act-2', title: 'Act II — The Descent' },
      ],
      storylines: [
        { id: 'heist', name: 'The Heist', color: '#5b6ee1', glyph: '◆', scenes: ['cold-open', 'the-job-offer', 'embers'] },
        { id: 'mara', name: "Mara's Trust", color: '#d5548e', glyph: '●', scenes: ['the-job-offer', 'the-dry-cistern'] },
        { id: 'rebellion', name: 'The Rebellion', color: '#2fa08d', glyph: '▲', scenes: ['pamphlets', 'embers'] },
      ],
      settings: {},
    }),
  )
  write('scenes/cold-open.md', scene('cold-open', 'storylines: [heist]\nact: act-1\n', 'Cold Open: Lowmarket', 'A grain lift goes sideways.'))
  write(
    'scenes/the-job-offer.md',
    scene('the-job-offer', 'storylines: [heist, mara]\nact: act-1\ncondition: trust >= 1\n', 'The Job Offer', 'Dax lays out the Vault job.'),
  )
  write('scenes/pamphlets.md', scene('pamphlets', 'storylines: [rebellion]\nact: act-1\neffects: [rebellion_strength += 1]\n', 'Pamphlets in the Underhive', 'Sedition under the fullers’ shop.'))
  write('scenes/the-dry-cistern.md', scene('the-dry-cistern', 'storylines: [mara]\nact: act-2\n', 'The Dry Cistern', 'Mara talks first.'))
  write('scenes/embers.md', scene('embers', 'storylines: [heist, rebellion]\nact: act-2\n', 'Ashes or Embers', 'What the Vault held.'))
  write('scenes/rooftop-duel.md', scene('rooftop-duel', '', 'Rooftop Duel', 'Tiles and fog, no witnesses except everyone.'))
  write('scenes/broken.md', 'this file has no frontmatter')
  write('characters/mara.md', '---\nid: mara\n---\n\n# Mara\n\nThe door-woman.\n')
  write('variables.json', JSON.stringify({ variables: [{ id: 'trust', type: 'number', initial: 0 }] }))
  return files
}

export interface TestWorld {
  platform: Platform
  files: InMemoryFileAccess
  watcher: ManualWatcher
  journal: InMemoryJournal
}

/** A platform whose picker always opens the Embers folder. */
export function embersWorld(): TestWorld {
  const files = embersFiles()
  const watcher = new ManualWatcher()
  const journal = new InMemoryJournal()
  const folder: OpenedFolder = { name: 'EmbersOfTheVault', files, watcher, journal }
  return {
    files,
    watcher,
    journal,
    platform: {
      pickFolder: async () => folder,
      recents: async () => [],
      openRecent: async () => folder,
      rememberOpened: async () => {},
    },
  }
}
