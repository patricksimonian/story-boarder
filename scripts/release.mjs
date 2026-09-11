/**
 * Cuts a release from the changesets.
 *
 * A changeset is one file under .changeset/ naming one change, in a
 * sentence or two, the way a reader of the release notes wants to hear it:
 *
 *   ---
 *   kind: fixed
 *   ---
 *   The coach accepts a five-field run again.
 *
 * Kinds: added, changed, fixed, removed. Write one in any editor, or:
 *
 *   pnpm changeset fixed "The coach accepts a five-field run again."
 *
 * The release workflow runs this with the version to release:
 *
 *   node scripts/release.mjs 0.2.0 --notes "$RUNNER_TEMP/notes.md"
 *
 * It bumps package.json, folds the changesets into a new section at the
 * top of CHANGELOG.md, deletes them, and writes that same section to the
 * notes file for the GitHub release. It refuses a version that is not
 * x.y.z, one that does not move forward, and a release with nothing to
 * say. `pnpm release:notes` prints what the next release would say and
 * changes nothing.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const KINDS = ['added', 'changed', 'fixed', 'removed']
const HEADING = { added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed' }

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** v0.2.0 and 0.2.0 both name 0.2.0; anything else is refused. */
export function parseVersion(input) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(input).trim())
  if (!m) throw new Error(`"${input}" is not a version of the form x.y.z`)
  return m.slice(1).map(Number)
}

/** True when `to` is a later version than `from`. */
export function versionAdvances(from, to) {
  const a = parseVersion(from)
  const b = parseVersion(to)
  for (let i = 0; i < 3; i++) {
    if (b[i] !== a[i]) return b[i] > a[i]
  }
  return false
}

/** One changeset file: a front matter block holding the kind, then the change. */
export function parseChangeset(text, name = 'changeset') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  if (!m) throw new Error(`${name}: expected a front matter block with a kind, then the change`)
  const kind = /^kind:\s*(\S+)\s*$/m.exec(m[1])?.[1]
  if (!KINDS.includes(kind)) throw new Error(`${name}: kind must be one of ${KINDS.join(', ')}`)
  const body = m[2].trim()
  if (!body) throw new Error(`${name}: says nothing`)
  return { kind, body }
}

/** Every changeset under `dir`, by file name. The folder's README is not one. */
export function readChangesets(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((file) => ({ file, ...parseChangeset(readFileSync(join(dir, file), 'utf8'), file) }))
}

/** The section for one release: a heading per kind in a fixed order, one bullet per changeset. */
export function releaseNotes(changesets) {
  const parts = []
  for (const kind of KINDS) {
    const ours = changesets.filter((c) => c.kind === kind)
    if (ours.length) parts.push(`### ${HEADING[kind]}\n\n${ours.map(bullet).join('\n')}`)
  }
  return parts.join('\n\n') + '\n'
}

function bullet({ body }) {
  const [first, ...rest] = body.split(/\r?\n/)
  return [`- ${first}`, ...rest.map((line) => (line ? `  ${line}` : ''))].join('\n')
}

/**
 * The changelog with a new release on top of the older ones: the section
 * goes before the first `## ` heading, or at the end when there is none yet.
 */
export function withRelease(changelog, version, date, notes) {
  const section = `## ${version} (${date})\n\n${notes}`
  const at = changelog.search(/^## /m)
  if (at === -1) return `${changelog.replace(/\s*$/, '')}\n\n${section}`
  return `${changelog.slice(0, at)}${section}\n${changelog.slice(at)}`
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Writes a changeset file and returns its path. The name comes from the
 * first words of the change plus a few random characters, so two people
 * describing the same thing on two branches never collide.
 */
export function writeChangeset(kind, text, dir = join(root, '.changeset')) {
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`)
  const body = text.trim()
  if (!body) throw new Error('a changeset says what changed; this one says nothing')
  const words = body.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join('-')
  const file = join(dir, `${words || 'change'}-${randomBytes(2).toString('hex')}.md`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `---\nkind: ${kind}\n---\n${body}\n`)
  return file
}

/**
 * Cuts the release in `dir`: package.json moves to `version`, the
 * changesets become the top section of CHANGELOG.md and are deleted, and
 * the notes land at `notesPath` when one is given. With `dryRun` nothing
 * is written. Returns the version, the tag, and the notes.
 */
export function cutRelease({ version: input, dir = root, date = today(), notesPath, dryRun = false }) {
  const [major, minor, patch] = parseVersion(input)
  const version = `${major}.${minor}.${patch}`
  const pkgPath = join(dir, 'package.json')
  const pkg = readFileSync(pkgPath, 'utf8')
  const current = JSON.parse(pkg).version
  if (!versionAdvances(current, version)) {
    throw new Error(`package.json is already at ${current}; ${version} does not move it forward`)
  }

  const changesetDir = join(dir, '.changeset')
  const changesets = readChangesets(changesetDir)
  if (!changesets.length) {
    throw new Error('nothing under .changeset/ to release — write one with: pnpm changeset <kind> "<what changed>"')
  }
  const notes = releaseNotes(changesets)

  if (!dryRun) {
    writeFileSync(pkgPath, pkg.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`))
    const changelogPath = join(dir, 'CHANGELOG.md')
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '# Changelog\n'
    writeFileSync(changelogPath, withRelease(changelog, version, date, notes))
    for (const { file } of changesets) rmSync(join(changesetDir, file))
    if (notesPath) writeFileSync(notesPath, notes)
  }
  return { version, tag: `v${version}`, notes }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const notesAt = args.indexOf('--notes')
  const notesPath = notesAt === -1 ? undefined : args[notesAt + 1]
  const version = args.find((a, i) => !a.startsWith('--') && (notesAt === -1 || i !== notesAt + 1))
  try {
    if (dryRun && !version) {
      // A preview needs no version: just what the notes would say.
      const changesets = readChangesets(join(root, '.changeset'))
      if (!changesets.length) throw new Error('nothing under .changeset/ yet — write one with: pnpm changeset <kind> "<what changed>"')
      process.stdout.write(releaseNotes(changesets))
    } else if (!version) {
      throw new Error('usage: node scripts/release.mjs <version> [--notes <file>] [--dry-run]')
    } else {
      const cut = cutRelease({ version, notesPath, dryRun })
      console.log(`${dryRun ? 'would release' : 'released'} ${cut.version} as ${cut.tag}\n`)
      process.stdout.write(cut.notes)
    }
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
