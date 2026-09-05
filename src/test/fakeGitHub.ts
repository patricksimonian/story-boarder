import {
  decodeCommit,
  decodeTree,
  encodeCommit,
  encodeTree,
  hashObject,
  type CommitObject,
  type ObjectType,
  type TreeEntry,
} from '../git/objects'
import type { Remote } from '../git/sync'

/**
 * A GitHub remote in memory, for tests. It behaves the way the Git Data
 * API does where it matters: objects are content-addressed with real git
 * hashing (so the sha the "server" answers with must equal the sha the
 * client computed — the same integrity check a push gets for free
 * against real GitHub), and the ref only moves when the caller knows the
 * value it's moving from. There is no force flag to send; the interface
 * cannot express one. goOffline() makes every call fail the way fetch
 * does with no network.
 */
export class FakeGitHub implements Remote {
  private objects = new Map<string, { type: ObjectType; body: Uint8Array }>()
  private ref: string | null = null
  private offline = false

  goOffline(): void {
    this.offline = true
  }

  goOnline(): void {
    this.offline = false
  }

  private net(): void {
    if (this.offline) throw new TypeError('fetch failed — no network')
  }

  private async put(type: ObjectType, body: Uint8Array): Promise<string> {
    const sha = await hashObject(type, body)
    this.objects.set(sha, { type, body })
    return sha
  }

  private get(sha: string, type: ObjectType): { type: ObjectType; body: Uint8Array } {
    const object = this.objects.get(sha)
    if (!object || object.type !== type) throw new Error(`No ${type} ${sha} on the remote`)
    return object
  }

  async head(): Promise<string | null> {
    this.net()
    return this.ref
  }

  async putBlob(content: Uint8Array): Promise<string> {
    this.net()
    return this.put('blob', content)
  }

  async getBlob(sha: string): Promise<Uint8Array> {
    this.net()
    return this.get(sha, 'blob').body
  }

  async putTree(entries: TreeEntry[]): Promise<string> {
    this.net()
    return this.put('tree', encodeTree(entries))
  }

  async getTree(sha: string): Promise<TreeEntry[]> {
    this.net()
    return decodeTree(this.get(sha, 'tree').body)
  }

  async putCommit(commit: CommitObject): Promise<string> {
    this.net()
    return this.put('commit', encodeCommit(commit))
  }

  async getCommit(sha: string): Promise<CommitObject> {
    this.net()
    return decodeCommit(this.get(sha, 'commit').body)
  }

  async setHead(sha: string, expectedOld: string | null): Promise<void> {
    this.net()
    if (this.ref !== expectedOld) {
      throw new Error('Reference moved — someone pushed meanwhile; pull first')
    }
    if (!this.objects.has(sha)) throw new Error(`Unknown commit ${sha}`)
    this.ref = sha
  }
}
