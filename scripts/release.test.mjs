// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cutRelease, parseChangeset, parseVersion, releaseNotes, versionAdvances, withRelease, writeChangeset } from './release.mjs'

/**
 * The release cut: the version must move forward, the changesets become
 * the notes and the top of the changelog, and nothing is written until
 * every check has passed.
 */

let dir
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

/** A project folder with package.json at `version` and the given changesets. */
function project(version, changesets = {}) {
  dir = mkdtempSync(join(tmpdir(), 'release-'))
  writeFileSync(join(dir, 'package.json'), `{\n  "name": "x",\n  "version": "${version}",\n  "scripts": {}\n}\n`)
  mkdirSync(join(dir, '.changeset'))
  writeFileSync(join(dir, '.changeset', 'README.md'), '# not a changeset\n')
  for (const [name, text] of Object.entries(changesets)) writeFileSync(join(dir, '.changeset', name), text)
  return dir
}

const changeset = (kind, body) => `---\nkind: ${kind}\n---\n${body}\n`

describe('versions', () => {
  test('with or without a leading v, x.y.z is a version and nothing else is', () => {
    expect(parseVersion('v0.2.0')).toEqual([0, 2, 0])
    expect(parseVersion('1.10.3')).toEqual([1, 10, 3])
    for (const bad of ['0.2', '0.2.0-rc1', 'latest', '', 'v.1.2']) expect(() => parseVersion(bad)).toThrow('x.y.z')
  })

  test('a release moves the version forward, by number and not by text', () => {
    expect(versionAdvances('0.1.3', '0.1.4')).toBe(true)
    expect(versionAdvances('0.1.9', '0.1.10')).toBe(true)
    expect(versionAdvances('0.1.3', '1.0.0')).toBe(true)
    expect(versionAdvances('0.1.3', '0.1.3')).toBe(false)
    expect(versionAdvances('0.2.0', '0.1.9')).toBe(false)
  })
})

describe('a changeset', () => {
  test('is a kind in front matter and the change after it', () => {
    expect(parseChangeset(changeset('fixed', 'The coach answers again.'))).toEqual({ kind: 'fixed', body: 'The coach answers again.' })
  })

  test('is refused without a known kind, or with nothing to say', () => {
    expect(() => parseChangeset('The coach answers again.\n', 'a.md')).toThrow('a.md: expected a front matter block')
    expect(() => parseChangeset(changeset('improved', 'x'), 'b.md')).toThrow('kind must be one of added, changed, fixed, removed')
    expect(() => parseChangeset(changeset('fixed', '   '), 'c.md')).toThrow('c.md: says nothing')
  })

  test('written by the command, reads back as itself and is named from its first words', () => {
    project('0.1.0')
    const file = writeChangeset('added', 'The board shows an act count. It updates live.', join(dir, '.changeset'))
    expect(file).toMatch(/[\\/]the-board-shows-an-act-[0-9a-f]{4}\.md$/)
    expect(parseChangeset(readFileSync(file, 'utf8'))).toEqual({ kind: 'added', body: 'The board shows an act count. It updates live.' })
  })
})

describe('the notes', () => {
  test('group by kind in a fixed order, one bullet each, with a long change indented under its bullet', () => {
    const notes = releaseNotes([
      { kind: 'fixed', body: 'The coach answers again.' },
      { kind: 'added', body: 'Scenes can be pinned.\nA pinned scene stays on the board.' },
      { kind: 'fixed', body: 'Notes keep their section on reload.' },
    ])
    expect(notes).toBe(
      '### Added\n\n- Scenes can be pinned.\n  A pinned scene stays on the board.\n\n### Fixed\n\n- The coach answers again.\n- Notes keep their section on reload.\n',
    )
  })

  test('go under the changelog title and above older releases, or at the end of a changelog with none', () => {
    const fresh = withRelease('# Changelog\n\nNewest first.\n', '0.2.0', '2026-09-10', '### Added\n\n- One.\n')
    expect(fresh).toBe('# Changelog\n\nNewest first.\n\n## 0.2.0 (2026-09-10)\n\n### Added\n\n- One.\n')
    const next = withRelease(fresh, '0.3.0', '2026-10-01', '### Fixed\n\n- Two.\n')
    expect(next).toBe('# Changelog\n\nNewest first.\n\n## 0.3.0 (2026-10-01)\n\n### Fixed\n\n- Two.\n\n## 0.2.0 (2026-09-10)\n\n### Added\n\n- One.\n')
  })
})

describe('cutting a release', () => {
  test('bumps package.json in place, writes the changelog and the notes file, and deletes the changesets but not the README', () => {
    project('0.1.3', { 'b-coach.md': changeset('fixed', 'The coach answers again.'), 'a-pins.md': changeset('added', 'Scenes can be pinned.') })
    const notesPath = join(dir, 'notes.md')
    const cut = cutRelease({ version: 'v0.1.4', dir, date: '2026-09-10', notesPath })

    expect(cut).toEqual({ version: '0.1.4', tag: 'v0.1.4', notes: '### Added\n\n- Scenes can be pinned.\n\n### Fixed\n\n- The coach answers again.\n' })
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe('{\n  "name": "x",\n  "version": "0.1.4",\n  "scripts": {}\n}\n')
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toBe(`# Changelog\n\n## 0.1.4 (2026-09-10)\n\n${cut.notes}`)
    expect(readFileSync(notesPath, 'utf8')).toBe(cut.notes)
    expect(readdirSync(join(dir, '.changeset'))).toEqual(['README.md'])
  })

  test('refuses a version that does not move forward, and touches nothing', () => {
    project('0.1.3', { 'a.md': changeset('fixed', 'x') })
    expect(() => cutRelease({ version: '0.1.3', dir })).toThrow('already at 0.1.3; 0.1.3 does not move it forward')
    expect(() => cutRelease({ version: '0.1.2', dir })).toThrow('does not move it forward')
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('0.1.3')
    expect(existsSync(join(dir, '.changeset', 'a.md'))).toBe(true)
  })

  test('refuses a release with nothing to say', () => {
    project('0.1.3')
    expect(() => cutRelease({ version: '0.1.4', dir })).toThrow('nothing under .changeset/ to release')
    expect(existsSync(join(dir, 'CHANGELOG.md'))).toBe(false)
  })

  test('a dry run reports the notes and writes nothing', () => {
    project('0.1.3', { 'a.md': changeset('changed', 'The sidebar lists acts.') })
    const cut = cutRelease({ version: '0.2.0', dir, dryRun: true, notesPath: join(dir, 'notes.md') })
    expect(cut.notes).toBe('### Changed\n\n- The sidebar lists acts.\n')
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('0.1.3')
    expect(existsSync(join(dir, 'CHANGELOG.md'))).toBe(false)
    expect(existsSync(join(dir, 'notes.md'))).toBe(false)
    expect(existsSync(join(dir, '.changeset', 'a.md'))).toBe(true)
  })
})
