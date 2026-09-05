import type { FileAccess } from '../adapters/types'

/**
 * Git's loose-object format, written by hand over FileAccess. The stage
 * needs plumbing only — blobs, trees, commits, refs — and every fs the
 * app touches already speaks FileAccess, so the same code runs against
 * the user's real folder and the in-memory folders in tests. No index,
 * no packfiles, no checkout; real git reads what this writes (each sha
 * below is pinned by a test against git 2.45's own output). The browser
 * supplies the primitives: WebCrypto SHA-1 and CompressionStream zlib.
 */

export type ObjectType = 'blob' | 'tree' | 'commit'

/** '100644' a file, '40000' a directory — the only modes the app writes. */
export type TreeMode = '100644' | '40000'

export interface TreeEntry {
  mode: TreeMode
  name: string
  /** Hex, 40 chars. */
  sha: string
}

export interface Ident {
  name: string
  email: string
  /** Seconds since the epoch. */
  time: number
  /** Zone as git writes it: '+0000', '-0500'. */
  tz: string
}

export interface CommitObject {
  tree: string
  parents: string[]
  author: Ident
  committer: Ident
  /** Without the trailing newline git stores. */
  message: string
}

const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder()

function concat(parts: Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    whole.set(part, at)
    at += part.length
  }
  return whole
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

function withHeader(type: ObjectType, body: Uint8Array): Uint8Array {
  return concat([utf8.encode(`${type} ${body.length}\0`), body])
}

export async function hashObject(type: ObjectType, body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', withHeader(type, body) as unknown as ArrayBuffer)
  return toHex(new Uint8Array(digest))
}

async function through(data: Uint8Array, transform: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  return new Uint8Array(await new Response(source.pipeThrough(transform)).arrayBuffer())
}

const deflate = (data: Uint8Array) => through(data, new CompressionStream('deflate'))
const inflate = (data: Uint8Array) => through(data, new DecompressionStream('deflate'))

/** Git's tree order: raw name bytes, a directory comparing as name + '/'. */
function treeSortKey(entry: TreeEntry): string {
  return entry.mode === '40000' ? `${entry.name}/` : entry.name
}

export function encodeTree(entries: TreeEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => (treeSortKey(a) < treeSortKey(b) ? -1 : 1))
  return concat(sorted.flatMap((entry) => [utf8.encode(`${entry.mode} ${entry.name}\0`), fromHex(entry.sha)]))
}

export function decodeTree(body: Uint8Array): TreeEntry[] {
  const entries: TreeEntry[] = []
  let at = 0
  while (at < body.length) {
    const space = body.indexOf(0x20, at)
    const nul = body.indexOf(0x00, space)
    const mode = fromUtf8.decode(body.slice(at, space))
    if (mode !== '100644' && mode !== '40000') {
      throw new Error(`Tree entry mode ${mode} — not something this app writes or reads`)
    }
    entries.push({
      mode,
      name: fromUtf8.decode(body.slice(space + 1, nul)),
      sha: toHex(body.slice(nul + 1, nul + 21)),
    })
    at = nul + 21
  }
  return entries
}

const identLine = (ident: Ident) => `${ident.name} <${ident.email}> ${ident.time} ${ident.tz}`

function parseIdent(line: string): Ident {
  const open = line.lastIndexOf(' <')
  const close = line.indexOf('>', open)
  const [time, tz] = line.slice(close + 2).split(' ')
  return { name: line.slice(0, open), email: line.slice(open + 2, close), time: Number(time), tz }
}

export function encodeCommit(commit: CommitObject): Uint8Array {
  const lines = [
    `tree ${commit.tree}`,
    ...commit.parents.map((parent) => `parent ${parent}`),
    `author ${identLine(commit.author)}`,
    `committer ${identLine(commit.committer)}`,
    '',
    commit.message,
  ]
  return utf8.encode(`${lines.join('\n')}\n`)
}

export function decodeCommit(body: Uint8Array): CommitObject {
  const text = fromUtf8.decode(body)
  const blank = text.indexOf('\n\n')
  const headers = text.slice(0, blank).split('\n')
  const commit: CommitObject = {
    tree: '',
    parents: [],
    author: { name: '', email: '', time: 0, tz: '+0000' },
    committer: { name: '', email: '', time: 0, tz: '+0000' },
    message: text.slice(blank + 2).replace(/\n$/, ''),
  }
  for (const header of headers) {
    const space = header.indexOf(' ')
    const value = header.slice(space + 1)
    switch (header.slice(0, space)) {
      case 'tree':
        commit.tree = value
        break
      case 'parent':
        commit.parents.push(value)
        break
      case 'author':
        commit.author = parseIdent(value)
        break
      case 'committer':
        commit.committer = parseIdent(value)
        break
    }
  }
  return commit
}

const objectPath = (sha: string) => `.git/objects/${sha.slice(0, 2)}/${sha.slice(2)}`

/** Whether the store already holds an object — cheap, no inflate. */
export async function hasObject(files: FileAccess, sha: string): Promise<boolean> {
  return files.exists(objectPath(sha))
}

/** Writes one loose object (deflated, content-addressed); resolves to its sha. */
export async function writeObject(files: FileAccess, type: ObjectType, body: Uint8Array): Promise<string> {
  const sha = await hashObject(type, body)
  const path = objectPath(sha)
  if (!(await files.exists(path))) await files.writeBinary(path, await deflate(withHeader(type, body)))
  return sha
}

export async function readObject(files: FileAccess, sha: string): Promise<{ type: ObjectType; body: Uint8Array }> {
  const raw = await inflate(await files.readBinary(objectPath(sha)))
  const nul = raw.indexOf(0x00)
  const header = fromUtf8.decode(raw.slice(0, nul))
  const type = header.slice(0, header.indexOf(' ')) as ObjectType
  return { type, body: raw.slice(nul + 1) }
}
