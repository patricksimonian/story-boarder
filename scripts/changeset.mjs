/**
 * Writes a changeset — one file under .changeset/ naming one change for
 * the next release's notes. See release.mjs for the format.
 *
 *   pnpm changeset fixed "The coach accepts a five-field run again."
 */
import { relative } from 'node:path'
import { KINDS, root, writeChangeset } from './release.mjs'

const [kind, ...words] = process.argv.slice(2)
const text = words.join(' ').trim()
if (!KINDS.includes(kind) || !text) {
  console.error(`usage: pnpm changeset <${KINDS.join('|')}> "<what changed, as a sentence a reader of the release notes wants>"`)
  process.exit(2)
}
console.log(`wrote ${relative(root, writeChangeset(kind, text))}`)
