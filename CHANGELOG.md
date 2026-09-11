# Changelog

Newest first. Written by the release workflow from the changesets under `.changeset/`.

## 0.1.5 (2026-09-11)

### Added

- Updated github action workflow to generate releases

  This Changeset is also a cumalitive of the alpha release of this. I was messing with version 0.1.3. Really this will reset to 0.2.0-beta whenever that ready.

### Fixed

- A boundary commit describes the file it actually holds. Its message used to come from a second read of the folder, so a save landing mid-walk could leave a commit named for a change it never held, and the history could show an edit commit with nothing after the title.

## 0.1.4 (2026-09-11)

### Added

- Releases are cut from the Actions tab with a version. The notes come from changesets.
