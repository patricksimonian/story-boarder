import { describe, expect, it } from 'vitest'
import { gitHubRemote } from './github'

/**
 * The REST shape of the remote: which endpoints, which headers, which
 * bodies. A fake fetch records every request and answers from a queue,
 * so each test pins the wire format — the part of sync only real GitHub
 * would otherwise check.
 */

interface Recorded {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function fakeFetch(...responses: { status: number; json: unknown }[]) {
  const calls: Recorded[] = []
  const queue = [...responses]
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    })
    const next = queue.shift() ?? { status: 500, json: { message: 'queue empty' } }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.json,
    } as Response
  }
  return { calls, fetchFn }
}

const SPOT = { owner: 'pat', repo: 'story', token: 'ghp_secret' }
const SHA = '3b18e512dba79e4c8300dd08aeb37f8e728b8dad'

describe('head', () => {
  it('reads refs/heads/main with the token', async () => {
    const { calls, fetchFn } = fakeFetch({ status: 200, json: { object: { sha: SHA } } })
    const remote = gitHubRemote(SPOT, fetchFn)
    expect(await remote.head()).toBe(SHA)
    expect(calls[0].url).toBe('https://api.github.com/repos/pat/story/git/ref/heads/main')
    expect(calls[0].method).toBe('GET')
    expect(calls[0].headers.Authorization).toBe('Bearer ghp_secret')
    expect(calls[0].headers.Accept).toBe('application/vnd.github+json')
  })

  it('reads an empty repository as null', async () => {
    const { fetchFn } = fakeFetch({ status: 404, json: { message: 'Not Found' } })
    expect(await gitHubRemote(SPOT, fetchFn).head()).toBeNull()
    const conflict = fakeFetch({ status: 409, json: { message: 'Git Repository is empty.' } })
    expect(await gitHubRemote(SPOT, conflict.fetchFn).head()).toBeNull()
  })
})

describe('blobs', () => {
  it('uploads base64 and hands back the sha', async () => {
    const { calls, fetchFn } = fakeFetch({ status: 201, json: { sha: SHA } })
    const sha = await gitHubRemote(SPOT, fetchFn).putBlob(new TextEncoder().encode('hello world\n'))
    expect(sha).toBe(SHA)
    expect(calls[0].url).toBe('https://api.github.com/repos/pat/story/git/blobs')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toEqual({ content: 'aGVsbG8gd29ybGQK', encoding: 'base64' })
  })

  it('downloads base64, newlines and all', async () => {
    const { calls, fetchFn } = fakeFetch({
      status: 200,
      json: { content: 'aGVsbG8gd2\n9ybGQK\n', encoding: 'base64' },
    })
    const bytes = await gitHubRemote(SPOT, fetchFn).getBlob(SHA)
    expect(new TextDecoder().decode(bytes)).toBe('hello world\n')
    expect(calls[0].url).toBe(`https://api.github.com/repos/pat/story/git/blobs/${SHA}`)
  })
})

describe('trees', () => {
  it('writes entries with GitHub’s five-digit directory mode', async () => {
    const { calls, fetchFn } = fakeFetch({ status: 201, json: { sha: SHA } })
    await gitHubRemote(SPOT, fetchFn).putTree([
      { mode: '100644', name: 'story.json', sha: SHA },
      { mode: '40000', name: 'scenes', sha: SHA },
    ])
    expect(calls[0].url).toBe('https://api.github.com/repos/pat/story/git/trees')
    expect(calls[0].body).toEqual({
      tree: [
        { path: 'story.json', mode: '100644', type: 'blob', sha: SHA },
        { path: 'scenes', mode: '040000', type: 'tree', sha: SHA },
      ],
    })
  })

  it('reads entries back into raw git modes', async () => {
    const { fetchFn } = fakeFetch({
      status: 200,
      json: {
        tree: [
          { path: 'story.json', mode: '100644', type: 'blob', sha: SHA },
          { path: 'scenes', mode: '040000', type: 'tree', sha: SHA },
        ],
      },
    })
    expect(await gitHubRemote(SPOT, fetchFn).getTree(SHA)).toEqual([
      { mode: '100644', name: 'story.json', sha: SHA },
      { mode: '40000', name: 'scenes', sha: SHA },
    ])
  })
})

describe('commits', () => {
  const IDENT = { name: 'Test Author', email: 'test@example.com', time: 1700000000, tz: '+0000' }

  it('writes message, tree, parents, and the exact UTC date', async () => {
    const { calls, fetchFn } = fakeFetch({ status: 201, json: { sha: SHA } })
    await gitHubRemote(SPOT, fetchFn).putCommit({
      tree: SHA,
      parents: [SHA],
      author: IDENT,
      committer: IDENT,
      message: 'First commit',
    })
    expect(calls[0].url).toBe('https://api.github.com/repos/pat/story/git/commits')
    expect(calls[0].body).toEqual({
      message: 'First commit',
      tree: SHA,
      parents: [SHA],
      author: { name: 'Test Author', email: 'test@example.com', date: '2023-11-14T22:13:20Z' },
      committer: { name: 'Test Author', email: 'test@example.com', date: '2023-11-14T22:13:20Z' },
    })
  })

  it('reads a commit back, offset preserved', async () => {
    const { fetchFn } = fakeFetch({
      status: 200,
      json: {
        message: 'First commit',
        tree: { sha: SHA },
        parents: [{ sha: SHA }],
        author: { name: 'Test Author', email: 'test@example.com', date: '2023-11-14T17:13:20-05:00' },
        committer: { name: 'Test Author', email: 'test@example.com', date: '2023-11-14T22:13:20Z' },
      },
    })
    const commit = await gitHubRemote(SPOT, fetchFn).getCommit(SHA)
    expect(commit).toEqual({
      message: 'First commit',
      tree: SHA,
      parents: [SHA],
      author: { name: 'Test Author', email: 'test@example.com', time: 1700000000, tz: '-0500' },
      committer: { name: 'Test Author', email: 'test@example.com', time: 1700000000, tz: '+0000' },
    })
  })
})

describe('the ref', () => {
  it('creates refs/heads/main on an empty repository', async () => {
    const { calls, fetchFn } = fakeFetch({ status: 201, json: {} })
    await gitHubRemote(SPOT, fetchFn).setHead(SHA, null)
    expect(calls[0].url).toBe('https://api.github.com/repos/pat/story/git/refs')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toEqual({ ref: 'refs/heads/main', sha: SHA })
  })

  it('updates by fast-forward only — the request carries no force flag', async () => {
    const { calls, fetchFn } = fakeFetch({ status: 200, json: {} })
    await gitHubRemote(SPOT, fetchFn).setHead(SHA, 'f'.repeat(40))
    expect(calls[0].url).toBe('https://api.github.com/repos/pat/story/git/refs/heads/main')
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toEqual({ sha: SHA })
    expect(Object.keys(calls[0].body as object)).not.toContain('force')
  })

  it('surfaces a rejected update as an error, not an overwrite', async () => {
    const { fetchFn } = fakeFetch({ status: 422, json: { message: 'Update is not a fast forward' } })
    await expect(gitHubRemote(SPOT, fetchFn).setHead(SHA, 'f'.repeat(40))).rejects.toThrow(/fast forward/)
  })
})
