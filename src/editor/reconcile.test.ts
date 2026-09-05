import { describe, expect, test } from 'vitest'
import { InMemoryFileAccess, InMemoryJournal } from '../adapters/stubs'
import { reconcileJournal } from './reconcile'

const ON_DISK = '---\nid: cistern\n---\n\n# The Dry Cistern\n\n## Prose\n\nMara talks first.\n'
const JOURNALED = ON_DISK.replace('Mara talks first.', 'Mara talks first, and does not stop.')

async function world(diskText: string | null) {
  const files = new InMemoryFileAccess()
  if (diskText !== null) await files.writeText('scenes/cistern.md', diskText)
  const journal = new InMemoryJournal()
  await journal.record({ path: 'scenes/cistern.md', baseText: ON_DISK, text: JOURNALED, at: 1 })
  return { files, journal }
}

describe('reconciling the journal on launch', () => {
  test('a journal ahead of an untouched disk is applied and cleared', async () => {
    const { files, journal } = await world(ON_DISK)
    const conflicts = await reconcileJournal(files, journal)
    expect(conflicts).toEqual([])
    expect(await files.readText('scenes/cistern.md')).toBe(JOURNALED)
    expect(await journal.pending()).toEqual([])
  })

  test('a disk that moved since journaling is a conflict, and the journal waits', async () => {
    const notepad = ON_DISK.replace('Mara talks first.', 'Rook talks first.')
    const { files, journal } = await world(notepad)
    const conflicts = await reconcileJournal(files, journal)
    expect(conflicts).toEqual([{ path: 'scenes/cistern.md', diskText: notepad, appText: JOURNALED }])
    expect(await files.readText('scenes/cistern.md')).toBe(notepad)
    expect(await journal.pending()).toHaveLength(1)
  })

  test('a journal already matching the disk just clears', async () => {
    const { files, journal } = await world(JOURNALED)
    expect(await reconcileJournal(files, journal)).toEqual([])
    expect(await journal.pending()).toEqual([])
  })

  test('a file deleted while the app was gone is a conflict against an empty disk', async () => {
    const { files, journal } = await world(null)
    const conflicts = await reconcileJournal(files, journal)
    expect(conflicts).toEqual([{ path: 'scenes/cistern.md', diskText: '', appText: JOURNALED }])
  })
})
