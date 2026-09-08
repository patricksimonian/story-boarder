import { beforeEach, describe, expect, it, vi } from 'vitest'

// The adapter's only job is to carry each Platform call to the right
// shell command with the right arguments, and to hand the shell's
// answers back in the app's shapes. So the shell is faked at the IPC
// boundary and the tests read like a contract for the Rust side.

const invoke = vi.fn()
const listeners: ((event: { payload: unknown }) => void)[] = []
const unlisten = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: (_name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.push(handler)
    return Promise.resolve(unlisten)
  },
}))

type CloseEvent = { preventDefault: () => void }
const closeListeners: ((event: CloseEvent) => Promise<void>)[] = []
const unlistenClose = vi.fn()

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (handler: (event: CloseEvent) => Promise<void>) => {
      closeListeners.push(handler)
      return Promise.resolve(unlistenClose)
    },
  }),
}))

const { TauriFileAccess, TauriFolderWatcher, forwardErrorsToShell, tauriPlatform } = await import('./tauri')

beforeEach(() => {
  invoke.mockReset()
  listeners.length = 0
  unlisten.mockReset()
  closeListeners.length = 0
  unlistenClose.mockReset()
})

describe('TauriFileAccess', () => {
  const files = new TauriFileAccess('C:\\stories\\vault')

  it('carries every call to its command with the folder root attached', async () => {
    invoke.mockResolvedValue(undefined)
    await files.readText('scenes/a.md')
    await files.writeText('scenes/a.md', 'text')
    await files.list('scenes')
    await files.listFolders('')
    await files.exists('story.json')
    await files.delete('notes/x.md')
    expect(invoke.mock.calls).toEqual([
      ['read_text', { root: 'C:\\stories\\vault', path: 'scenes/a.md' }],
      ['write_text', { root: 'C:\\stories\\vault', path: 'scenes/a.md', contents: 'text' }],
      ['list_files', { root: 'C:\\stories\\vault', dir: 'scenes' }],
      ['list_folders', { root: 'C:\\stories\\vault', dir: '' }],
      ['exists', { root: 'C:\\stories\\vault', path: 'story.json' }],
      ['delete_entry', { root: 'C:\\stories\\vault', path: 'notes/x.md' }],
    ])
  })

  it('reads binary as bytes and writes binary as a raw body with encoded headers', async () => {
    invoke.mockResolvedValueOnce(new Uint8Array([1, 2, 3]).buffer)
    expect(await files.readBinary('assets/a.png')).toEqual(new Uint8Array([1, 2, 3]))

    invoke.mockResolvedValueOnce(undefined)
    const bytes = new Uint8Array([9, 8])
    await new TauriFileAccess('C:\\Users\\José\\s').writeBinary('assets/b.png', bytes)
    expect(invoke).toHaveBeenLastCalledWith('write_binary', bytes, {
      headers: { 'x-root': 'C%3A%5CUsers%5CJos%C3%A9%5Cs', 'x-path': 'assets%2Fb.png' },
    })
  })

  it("turns the shell's error strings into Errors the app can read", async () => {
    invoke.mockRejectedValueOnce('No file at scenes/gone.md')
    await expect(files.readText('scenes/gone.md')).rejects.toThrow('No file at scenes/gone.md')
  })
})

describe('TauriFolderWatcher', () => {
  it('starts the shell watcher, forwards only its own folder, and stops cleanly', async () => {
    invoke.mockResolvedValue(undefined)
    const handler = vi.fn()
    const stop = new TauriFolderWatcher('C:\\a').watch(handler)
    expect(invoke).toHaveBeenCalledWith('watch_folder', { root: 'C:\\a' })
    await Promise.resolve()

    listeners[0]({ payload: { root: 'C:\\b', paths: ['scenes/x.md'] } })
    listeners[0]({ payload: { root: 'C:\\a', paths: [] } })
    listeners[0]({ payload: { root: 'C:\\a', paths: ['scenes/x.md', 'story.json'] } })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(['scenes/x.md', 'story.json'])

    stop()
    await Promise.resolve()
    listeners[0]({ payload: { root: 'C:\\a', paths: ['late.md'] } })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(unlisten).toHaveBeenCalled()
    expect(invoke).toHaveBeenLastCalledWith('unwatch_folder', { root: 'C:\\a' })
  })
})

describe('tauriPlatform', () => {
  it('opens a picked folder, knows its path, and remembers it by that path', async () => {
    const platform = tauriPlatform()
    invoke.mockResolvedValueOnce({ name: 'vault', path: 'C:\\stories\\vault' })
    const folder = await platform.pickFolder()
    expect(folder?.name).toBe('vault')
    expect(folder?.path).toBe('C:\\stories\\vault')

    invoke.mockResolvedValueOnce(undefined)
    await platform.rememberOpened(folder!)
    expect(invoke).toHaveBeenLastCalledWith('remember_opened', { root: 'C:\\stories\\vault' })
  })

  it('opens and reveals files through the shell', async () => {
    const platform = tauriPlatform()
    invoke.mockResolvedValueOnce({ name: 'vault', path: 'C:\\stories\\vault' })
    const folder = (await platform.pickFolder())!
    invoke.mockResolvedValue(undefined)
    await folder.open!('exports/vault.html')
    expect(invoke).toHaveBeenLastCalledWith('open_path', { root: 'C:\\stories\\vault', path: 'exports/vault.html' })
    await folder.reveal!('exports/vault.html')
    expect(invoke).toHaveBeenLastCalledWith('reveal_path', { root: 'C:\\stories\\vault', path: 'exports/vault.html' })
  })

  it('resolves null for a dismissed picker and an unknown recent', async () => {
    const platform = tauriPlatform()
    invoke.mockResolvedValueOnce(null)
    expect(await platform.pickFolder()).toBeNull()
    invoke.mockResolvedValueOnce(null)
    expect(await platform.openRecent('nobody')).toBeNull()
  })

  it('lists recents by name, newest first as the shell orders them, and survives a failure', async () => {
    const platform = tauriPlatform()
    invoke.mockResolvedValueOnce([
      { name: 'two', path: 'C:\\two', opened_at: 2 },
      { name: 'one', path: 'C:\\one', opened_at: 1 },
    ])
    expect(await platform.recents()).toEqual(['two', 'one'])
    invoke.mockRejectedValueOnce('no data dir')
    expect(await platform.recents()).toEqual([])
  })

  it('holds the window open for the closing work, then lets it go', async () => {
    const platform = tauriPlatform()
    let finished = false
    const stop = platform.onCloseRequested!(async () => {
      await Promise.resolve()
      finished = true
    })
    expect(closeListeners).toHaveLength(1)
    const preventDefault = vi.fn()
    await closeListeners[0]({ preventDefault })
    expect(finished).toBe(true)
    // Not prevented: the window API destroys the window once this resolves.
    expect(preventDefault).not.toHaveBeenCalled()

    stop()
    await Promise.resolve()
    expect(unlistenClose).toHaveBeenCalled()
  })

  it('does not let a stuck or failing handler hold the window hostage', async () => {
    vi.useFakeTimers()
    try {
      const platform = tauriPlatform()
      platform.onCloseRequested!(() => new Promise(() => {}))
      let released = false
      void closeListeners[0]({ preventDefault: vi.fn() }).then(() => {
        released = true
      })
      await vi.advanceTimersByTimeAsync(9000)
      expect(released).toBe(false)
      await vi.advanceTimersByTimeAsync(1000)
      expect(released).toBe(true)

      platform.onCloseRequested!(async () => {
        throw new Error('flush failed')
      })
      await expect(closeListeners[1]({ preventDefault: vi.fn() })).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets a vanished recent reject with the shell\'s reason', async () => {
    const platform = tauriPlatform()
    invoke.mockRejectedValueOnce('vault is no longer at C:\\stories\\vault — pick the folder again instead.')
    await expect(platform.openRecent('vault')).rejects.toThrow('pick the folder again')
  })
})

describe('forwardErrorsToShell', () => {
  it('sends uncaught errors and unhandled rejections to the shell log, until uninstalled', async () => {
    invoke.mockResolvedValue(undefined)
    // A page-shaped target of our own: an ErrorEvent on the real window
    // is an uncaught exception as far as the test runner is concerned.
    const page = new EventTarget() as unknown as Window
    const uninstall = forwardErrorsToShell(page)

    page.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }))
    expect(invoke).toHaveBeenLastCalledWith('log_error', {
      message: expect.stringMatching(/^Uncaught: Error: boom/),
    })

    const rejection = new Event('unhandledrejection')
    Object.defineProperty(rejection, 'reason', { value: 'No file at scenes/gone.md' })
    page.dispatchEvent(rejection)
    expect(invoke).toHaveBeenLastCalledWith('log_error', {
      message: 'Unhandled rejection: No file at scenes/gone.md',
    })

    // The shell refusing the report must not become another error.
    invoke.mockRejectedValueOnce('Command log_error not found')
    page.dispatchEvent(new ErrorEvent('error', { error: new Error('again'), message: 'again' }))
    await Promise.resolve()

    uninstall()
    invoke.mockClear()
    page.dispatchEvent(new ErrorEvent('error', { error: new Error('silent'), message: 'silent' }))
    expect(invoke).not.toHaveBeenCalled()
  })
})
