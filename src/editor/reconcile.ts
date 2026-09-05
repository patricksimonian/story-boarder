import type { FileAccess, Journal } from '../adapters/types'

/** A journal entry the disk moved out from under: the writer has to pick. */
export interface JournalConflict {
  path: string
  diskText: string
  appText: string
}

/**
 * Runs at launch, before the story loads. Every pending entry is the
 * editor's last word on a file that never got its confirmed disk write —
 * a crash, a power cut, a closed tab. When the disk still reads exactly
 * as the entry was edited from, the entry is applied and cleared. When
 * the disk moved meanwhile (Notepad, another machine, a deletion), the
 * entry stays put and the pair comes back for the side-by-side view.
 */
export async function reconcileJournal(files: FileAccess, journal: Journal): Promise<JournalConflict[]> {
  const conflicts: JournalConflict[] = []
  for (const entry of await journal.pending()) {
    const diskText = (await files.exists(entry.path)) ? await files.readText(entry.path) : ''
    if (diskText === entry.text) {
      await journal.clear(entry.path)
    } else if (diskText === entry.baseText) {
      await files.writeText(entry.path, entry.text)
      await journal.clear(entry.path)
    } else {
      conflicts.push({ path: entry.path, diskText, appText: entry.text })
    }
  }
  return conflicts
}
