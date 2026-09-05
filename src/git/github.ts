import type { CommitObject, Ident, TreeEntry } from './objects'
import type { Remote } from './sync'

/**
 * The user's own GitHub repository as a Remote, over the Git Data REST
 * API — real blobs, trees, commits, and one branch ref, authenticated
 * by a fine-grained PAT. Browsers can't speak git protocol to
 * github.com and a public CORS proxy was never acceptable; REST it is.
 * The ref update never carries a force flag: GitHub refuses anything
 * but a fast-forward, which is exactly the standing rule.
 */

export interface GitHubSpot {
  owner: string
  repo: string
  token: string
}

interface Answer {
  ok: boolean
  status: number
  json: unknown
}

export function gitHubRemote(spot: GitHubSpot, fetchFn: typeof fetch = fetch): Remote {
  const base = `https://api.github.com/repos/${spot.owner}/${spot.repo}`

  async function request(path: string, init: { method?: string; body?: unknown } = {}): Promise<Answer> {
    const response = await fetchFn(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${spot.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const json = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, json }
  }

  function need<T>(answer: Answer, doing: string): T {
    if (!answer.ok) {
      const detail = (answer.json as { message?: string }).message ?? `HTTP ${answer.status}`
      throw new Error(`GitHub, ${doing}: ${detail}`)
    }
    return answer.json as T
  }

  return {
    async head() {
      const answer = await request('/git/ref/heads/main')
      // 404: no main yet. 409: the repository has no commits at all.
      if (answer.status === 404 || answer.status === 409) return null
      return need<{ object: { sha: string } }>(answer, 'reading main').object.sha
    },

    async putBlob(content) {
      const body = { content: toBase64(content), encoding: 'base64' }
      return need<{ sha: string }>(await request('/git/blobs', { method: 'POST', body }), 'writing a blob').sha
    },

    async getBlob(sha) {
      return fromBase64(need<{ content: string }>(await request(`/git/blobs/${sha}`), 'reading a blob').content)
    },

    async putTree(entries) {
      const body = {
        tree: entries.map((entry) => ({
          path: entry.name,
          mode: entry.mode === '40000' ? '040000' : entry.mode,
          type: entry.mode === '40000' ? 'tree' : 'blob',
          sha: entry.sha,
        })),
      }
      return need<{ sha: string }>(await request('/git/trees', { method: 'POST', body }), 'writing a tree').sha
    },

    async getTree(sha) {
      const json = need<{ tree: { path: string; mode: string; sha: string }[] }>(
        await request(`/git/trees/${sha}`),
        'reading a tree',
      )
      return json.tree.map((entry): TreeEntry => {
        const mode = entry.mode === '040000' ? '40000' : entry.mode
        if (mode !== '100644' && mode !== '40000') {
          throw new Error(`Tree entry mode ${entry.mode} — not something this app reads`)
        }
        return { mode, name: entry.path, sha: entry.sha }
      })
    },

    async putCommit(commit) {
      const body = {
        message: commit.message,
        tree: commit.tree,
        parents: commit.parents,
        author: identOut(commit.author),
        committer: identOut(commit.committer),
      }
      return need<{ sha: string }>(await request('/git/commits', { method: 'POST', body }), 'writing a commit').sha
    },

    async getCommit(sha) {
      const json = need<{
        message: string
        tree: { sha: string }
        parents: { sha: string }[]
        author: { name: string; email: string; date: string }
        committer: { name: string; email: string; date: string }
      }>(await request(`/git/commits/${sha}`), 'reading a commit')
      const commit: CommitObject = {
        message: json.message,
        tree: json.tree.sha,
        parents: json.parents.map((parent) => parent.sha),
        author: identIn(json.author),
        committer: identIn(json.committer),
      }
      return commit
    },

    async setHead(sha, expectedOld) {
      if (expectedOld === null) {
        need(await request('/git/refs', { method: 'POST', body: { ref: 'refs/heads/main', sha } }), 'creating main')
        return
      }
      // No force flag, ever — GitHub only moves the ref for a fast-forward.
      need(await request('/git/refs/heads/main', { method: 'PATCH', body: { sha } }), 'moving main')
    },
  }
}

/* ---------- encodings ---------- */

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** GitHub wraps base64 with newlines; strip all whitespace first. */
function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Git's `seconds +zone` as the ISO date GitHub hashes into the same ident line. */
function identOut(ident: Ident): { name: string; email: string; date: string } {
  const minutes = Number(ident.tz.slice(0, 3)) * 60 + Number(ident.tz[0] + ident.tz.slice(3))
  const wall = new Date((ident.time + minutes * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, '')
  const date = ident.tz === '+0000' ? `${wall}Z` : `${wall}${ident.tz.slice(0, 3)}:${ident.tz.slice(3)}`
  return { name: ident.name, email: ident.email, date }
}

function identIn(raw: { name: string; email: string; date: string }): Ident {
  const match = raw.date.match(/([+-]\d{2}):?(\d{2})$/)
  return {
    name: raw.name,
    email: raw.email,
    time: Math.floor(Date.parse(raw.date) / 1000),
    tz: match ? `${match[1]}${match[2]}` : '+0000',
  }
}
