import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { IdbJournal, openDb } from './browser'

beforeEach(() => {
  indexedDB = new IDBFactory()
})

describe('the IndexedDB journal', () => {
  test('records, lists oldest first, and clears per path', async () => {
    const journal = new IdbJournal('Embers')
    await journal.record({ path: 'scenes/b.md', baseText: 'b0', text: 'b1', at: 2 })
    await journal.record({ path: 'scenes/a.md', baseText: 'a0', text: 'a1', at: 1 })
    await journal.record({ path: 'scenes/a.md', baseText: 'a0', text: 'a2', at: 3 })
    expect(await journal.pending()).toEqual([
      { path: 'scenes/b.md', baseText: 'b0', text: 'b1', at: 2 },
      { path: 'scenes/a.md', baseText: 'a0', text: 'a2', at: 3 },
    ])
    await journal.clear('scenes/a.md')
    expect((await journal.pending()).map((e) => e.path)).toEqual(['scenes/b.md'])
  })

  test('two story folders keep separate journals', async () => {
    await new IdbJournal('Embers').record({ path: 'scenes/a.md', baseText: '', text: 'x', at: 1 })
    expect(await new IdbJournal('Other').pending()).toEqual([])
  })

  test('a database from before the journal existed upgrades without losing recents', async () => {
    // Stage 1 shipped version 1 with only the recents store.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('storyline-app', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('recent-folders', { keyPath: 'name' })
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('recent-folders', 'readwrite')
        tx.objectStore('recent-folders').put({ name: 'Embers', handle: {}, openedAt: 5 })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error as Error)
      }
      request.onerror = () => reject(request.error as Error)
    })

    const journal = new IdbJournal('Embers')
    await journal.record({ path: 'scenes/a.md', baseText: '', text: 'x', at: 1 })
    expect(await journal.pending()).toHaveLength(1)

    const db = await openDb()
    const recents = await new Promise<unknown[]>((resolve) => {
      const request = db.transaction('recent-folders').objectStore('recent-folders').getAll()
      request.onsuccess = () => resolve(request.result)
    })
    expect(recents).toEqual([{ name: 'Embers', handle: {}, openedAt: 5 }])
  })
})
