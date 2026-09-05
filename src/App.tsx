import { useEffect, useMemo, useRef, useState } from 'react'
// App.css is pulled in by index.css, inside Tailwind's components layer.
import type { OpenedFolder, Platform } from './adapters/types'
import type { Note, Playthrough, ReferenceEntity, ReferenceKind, Scene, Slug, StoryManifest, VariableRegistry } from './domain/types'
import { analyse } from './engine/analyse'
import { parseNoteFile, serializeNoteFile } from './files/noteFile'
import { parseReferenceFile, serializeReferenceFile } from './files/referenceFile'
import { parseSceneFile, serializeSceneFile } from './files/sceneFile'
import { reconcileJournal, type JournalConflict } from './editor/reconcile'
import { DEFAULT_IDENT, folderGit } from './git/client'
import { gitHubRemote, type GitHubSpot } from './git/github'
import { completeMerge, sync as syncStory, type Remote } from './git/sync'
import { exportPlayable } from './interchange/export'
import { importToFiles } from './interchange/import'
import { applySuggestion, type LiftSuggestion } from './interchange/lift'
import runtimeJs from './player/runtime.generated.js?raw'
import { readSceneFromHash, readViewFromHash, viewToHash, type View } from './state/view'
import { loadStory, type LoadedStory } from './story/loadStory'
import { applyTemplate } from './story/templates'
import type { Dragging } from './board/drop'
import { layoutBoard } from './board/layout'
import {
  addNotebookSection,
  createAct,
  createNote,
  createReference,
  createScene,
  createStoryline,
  deleteAct,
  deleteNote,
  deleteReference,
  deletePlaythrough,
  deleteScene,
  deleteStoryline,
  moveAct,
  moveStoryline,
  placeScene,
  referenceDir,
  renameAct,
  storeAsset,
  savePlaythrough,
  saveRegistry,
  setSyncRemote,
  setWordGoal,
  updateStoryline,
  type Placement,
} from './story/mutations'
import { EditActDialog, EditStorylineDialog, type Editing } from './ui/StructureDialogs'
import { ActView } from './ui/ActView'
import { AnalysisView } from './ui/AnalysisView'
import { Board } from './ui/Board'
import { CoachView } from './ui/CoachView'
import { ConflictView } from './ui/ConflictView'
import { ExportNote, type ExportState } from './ui/ExportNote'
import { GraphView } from './ui/GraphView'
import { CheckpointDialog, HistoryView } from './ui/HistoryView'
import { ImportDialog, LiftDialog } from './ui/ImportDialogs'
import { PullDialog, SyncView, type SyncSettings } from './ui/SyncView'
import { NewActDialog, NewSceneDialog, NewStorylineDialog, type Creating } from './ui/CreateDialog'
import { Minimap } from './ui/Minimap'
import { LibraryView } from './ui/LibraryView'
import { NotesView } from './ui/NotesView'
import { Overview } from './ui/Overview'
import { PoolDrawer } from './ui/PoolDrawer'
import { ProblemsBar } from './ui/ProblemsBar'
import { RawEditor } from './ui/RawEditor'
import { SceneEditor } from './ui/SceneEditor'
import { SearchView } from './ui/SearchView'
import { SimulateView } from './ui/SimulateView'
import { StatsView } from './ui/StatsView'
import { Sidebar } from './ui/Sidebar'
import { StartScreen } from './ui/StartScreen'
import { VariablesView } from './ui/VariablesView'

const BOARD_PITCH = 160

const TOKEN_KEY = 'storyline-app:github-token'

/** The GitHub spot for a story: owner and repo from its settings, the token from this browser. */
function spotFrom(manifest: StoryManifest | undefined): GitHubSpot | null {
  const sync = (manifest?.settings as { sync?: SyncSettings } | undefined)?.sync
  const token = localStorage.getItem(TOKEN_KEY)
  if (!sync?.owner || !sync.repo || !token) return null
  return { owner: sync.owner, repo: sync.repo, token }
}

/** A flagged file open for raw editing; dirty when text has moved past savedText. */
interface RawEdit {
  path: string
  message: string
  text: string
  savedText: string
}

interface Conflict {
  path: string
  diskText: string
  appText: string
}

/**
 * The scene open in the slide-over editor. Two texts measure it: diskText
 * is the file exactly as it last read (or was last written), which is
 * what the watcher's echoes are compared against; cleanText is that same
 * file re-serialized, so a hand-formatted file the writer never touched
 * is never rewritten just for being opened.
 */
interface Draft {
  path: string
  scene: Scene
  diskText: string
  cleanText: string
  /** Bumps whenever the scene was replaced from disk, so the prose remounts. */
  revision: number
}

function draftFromText(path: string, id: Slug, text: string, revision: number): Draft | null {
  const result = parseSceneFile(id, text)
  if (!result.ok) return null
  return { path, scene: result.scene, diskText: text, cleanText: serializeSceneFile(result.scene), revision }
}

const isDirty = (draft: Draft) => serializeSceneFile(draft.scene) !== draft.cleanText

/** The note open in the notes view. diskText plays the scene draft's role: the file as last read or written. */
interface NoteDraft {
  note: Note
  diskText: string
}

const notePath = (id: Slug) => `notes/${id}.md`

interface RefDraft {
  entity: ReferenceEntity
  diskText: string
}

const referencePath = (kind: ReferenceKind, id: Slug) => `${referenceDir(kind)}/${id}.md`

export default function App({
  platform,
  autosaveDelayMs = 1000,
  boundaryIdleMs = 180000,
  makeRemote = (spot: GitHubSpot) => gitHubRemote(spot),
}: {
  platform: Platform
  /** How long typing pauses before the disk follows. */
  autosaveDelayMs?: number
  /** How long the folder rests before an idle boundary commit. */
  boundaryIdleMs?: number
  /** How a GitHub spot becomes a Remote — tests hand in a fake. */
  makeRemote?: (spot: GitHubSpot) => Remote
}) {
  const [folder, setFolder] = useState<OpenedFolder | null>(null)
  const [loaded, setLoaded] = useState<LoadedStory | null>(null)
  const [view, setViewState] = useState<View>({ level: 'storylines' })
  const [poolOpen, setPoolOpen] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const [startError, setStartError] = useState<string | null>(null)
  /** A picked folder with no story.json, held so a story can be started in it. */
  const [emptyFolder, setEmptyFolder] = useState<OpenedFolder | null>(null)
  const [rawEdit, setRawEdit] = useState<RawEdit | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [creating, setCreating] = useState<Creating | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const [checkpointOpen, setCheckpointOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [pullOpen, setPullOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [liftOffers, setLiftOffers] = useState<LiftSuggestion[] | null>(null)
  const [exportState, setExportState] = useState<ExportState | null>(null)
  const [draft, setDraftState] = useState<Draft | null>(null)

  // The draft is read from async work (saves, watcher events) that must
  // see the latest keystroke, not the render it was born in.
  const draftRef = useRef<Draft | null>(null)
  const setDraft = (next: Draft | null) => {
    draftRef.current = next
    setDraftState(next)
  }
  const saveTimer = useRef<number | undefined>(undefined)
  /** The auto-save write currently in flight, so watcher echoes can wait it out. */
  const pendingWrite = useRef<Promise<void> | null>(null)

  // The notebook's open page, mirrored in a ref for async work — the
  // same shape the scene draft takes, at a fraction of the size.
  const [noteDraft, setNoteDraftState] = useState<NoteDraft | null>(null)
  const noteDraftRef = useRef<NoteDraft | null>(null)
  const setNoteDraft = (next: NoteDraft | null) => {
    noteDraftRef.current = next
    setNoteDraftState(next)
  }
  const noteSaveTimer = useRef<number | undefined>(undefined)

  // The library's open page: the same shape again.
  const [refDraft, setRefDraftState] = useState<RefDraft | null>(null)
  const refDraftRef = useRef<RefDraft | null>(null)
  const setRefDraft = (next: RefDraft | null) => {
    refDraftRef.current = next
    setRefDraftState(next)
  }
  const refSaveTimer = useRef<number | undefined>(undefined)
  const findings = useMemo(() => (loaded ? analyse(loaded.story) : []), [loaded])
  const git = useMemo(() => (folder ? folderGit(folder.files) : null), [folder])
  /** Conflicts found at launch, shown one at a time. */
  const queuedConflicts = useRef<JournalConflict[]>([])

  useEffect(() => {
    void platform.recents().then(setRecents)
  }, [platform])

  // A pending save dies with the component: a crash gets no cleanup hook
  // either, and the journal is what covers both.
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  /**
   * A natural boundary: commit whatever the folder holds, under a
   * generated message. Commits are serialized through one queue so a
   * fast scene-switch can't race the open-time sweep; a declined commit
   * (nothing changed) costs a hash walk and writes nothing.
   */
  const commitQueue = useRef(Promise.resolve())
  /** Set while a pulled divergence waits on the writer; the remote head to merge with. */
  const pendingMergeHead = useRef<string | null>(null)
  function boundaryCommit(target: OpenedFolder | null = folder, manifest = loaded?.story.manifest): void {
    if (!target) return
    const { files } = target
    const spot = spotFrom(manifest)
    commitQueue.current = commitQueue.current
      .then(() => folderGit(files).commitBoundary())
      .then(() => (spot ? performSync(target, spot) : undefined))
      .then(() => undefined, () => undefined)
  }

  // A few minutes of quiet after the last disk change is a boundary too.
  useEffect(() => {
    if (!folder || !loaded) return
    const timer = window.setTimeout(() => boundaryCommit(), boundaryIdleMs)
    return () => clearTimeout(timer)
  })

  /** A checkpoint: the writer's own words, through the same commit queue. */
  function commitCheckpoint(message: string): Promise<string | null> {
    if (!folder) return Promise.resolve(null)
    const target = folder
    const spot = spotFrom(loaded?.story.manifest)
    const run = commitQueue.current.then(() => folderGit(target.files).checkpoint(message))
    commitQueue.current = run
      .then((sha) => (sha && spot ? performSync(target, spot) : undefined))
      .then(
        () => undefined,
        () => undefined,
      )
    return run
  }

  /** Runs one sync and turns the outcome into words for the Sync view. */
  async function performSync(target: OpenedFolder, spot: GitHubSpot): Promise<void> {
    const result = await syncStory(target.files, makeRemote(spot), DEFAULT_IDENT)
    const s = (n: number) => (n === 1 ? '' : 's')
    switch (result.kind) {
      case 'clean':
        setSyncStatus('Up to date')
        break
      case 'pushed':
        setSyncStatus(`Pushed ${result.commits} commit${s(result.commits)}`)
        break
      case 'offline':
        setSyncStatus('Offline — commits stay local and push when the network returns')
        break
      case 'pulled':
        setSyncStatus(`Pulled ${result.commits} commit${s(result.commits)}`)
        await followPulledFiles(target, result.changed)
        await reload(target)
        break
      case 'merged':
        if (result.conflicts.length === 0) {
          setSyncStatus('Merged work from the remote')
        } else {
          setSyncStatus(`${result.conflicts.length} overlap${s(result.conflicts.length)} to settle side by side`)
          pendingMergeHead.current = result.remoteHead
          const mapped = result.conflicts.map((c) => ({
            path: c.path,
            diskText: c.theirs ?? '',
            appText: c.mine ?? '',
          }))
          queuedConflicts.current.push(...mapped.slice(1))
          setConflict(mapped[0])
        }
        await reload(target)
        break
    }
  }

  /** After a pull, the open draft follows the disk the same way watcher events do. */
  async function followPulledFiles(target: OpenedFolder, changed: string[]): Promise<void> {
    const current = draftRef.current
    if (!current || !changed.includes(current.path)) return
    const diskText = await target.files.readText(current.path).catch(() => '')
    if (diskText === current.diskText) return
    if (isDirty(current)) setConflict({ path: current.path, diskText, appText: serializeSceneFile(current.scene) })
    else replaceDraft(current, diskText)
  }

  /**
   * Joins a story from another machine: the picked empty folder receives
   * the whole repository, the settings learn the remote if the pulled
   * manifest doesn't carry it, and the folder opens like any other.
   */
  async function pullIntoEmpty(spot: GitHubSpot): Promise<void> {
    const target = emptyFolder
    if (!target) return
    localStorage.setItem(TOKEN_KEY, spot.token)
    try {
      const result = await syncStory(target.files, makeRemote(spot), DEFAULT_IDENT)
      if (result.kind !== 'pulled') {
        setStartError(
          result.kind === 'offline'
            ? 'Could not reach GitHub — check the network and try again.'
            : 'That repository holds nothing to pull.',
        )
        return
      }
      const manifest = JSON.parse(await target.files.readText('story.json')) as {
        settings?: { sync?: unknown }
      }
      if (!manifest.settings?.sync) await setSyncRemote(target.files, { owner: spot.owner, repo: spot.repo })
      setPullOpen(false)
      await open(target)
    } catch (error) {
      setStartError(`Could not pull the story: ${(error as Error).message}`)
    }
  }

  /**
   * Imports a picked file into the empty folder: the content decides
   * whether it's Twee, Twine HTML, a .pltr, or one of our own playable
   * exports. Twine's liftable macros are offered right after the story
   * opens — suggestions, never silent conversion.
   */
  async function importStoryFile(file: File): Promise<void> {
    const target = emptyFolder
    if (!target) return
    const result = importToFiles(file.name, await file.text())
    if (!result.ok) {
      setImportOpen(false)
      setStartError(result.reason)
      return
    }
    for (const [path, text] of Object.entries(result.files)) {
      await target.files.writeText(path, text)
    }
    setImportOpen(false)
    await open(target)
    if (result.suggestions.length > 0) setLiftOffers(result.suggestions)
  }

  /** Writes the accepted lift suggestions into their scenes, then follows the disk. */
  async function applyLifts(chosen: LiftSuggestion[]): Promise<void> {
    if (!folder) return
    for (const suggestion of chosen) await applySuggestion(folder.files, suggestion)
    setLiftOffers(null)
    await reload(folder)
  }

  /** Compiles the story with the embedded runtime into exports/<slug>.html. */
  async function exportStory(): Promise<void> {
    if (!folder) return
    setExportState({ kind: 'working' })
    const result = await exportPlayable(folder.files, runtimeJs)
    if (!result.ok) {
      setExportState({ kind: 'failed', reason: result.reason })
      return
    }
    const path = `exports/${result.name}.html`
    try {
      await folder.files.writeText(path, result.html)
    } catch (error) {
      setExportState({ kind: 'failed', reason: `Could not write ${path}: ${(error as Error).message}` })
      return
    }
    setExportState({ kind: 'saved', path })
  }

  /** Saves the remote — owner and repo with the story, the token app-local — then syncs. */
  async function saveSync(spot: GitHubSpot): Promise<void> {
    if (!folder) return
    const target = folder
    localStorage.setItem(TOKEN_KEY, spot.token)
    const current = spotFrom(loaded?.story.manifest)
    if (current?.owner !== spot.owner || current?.repo !== spot.repo) {
      await setSyncRemote(target.files, { owner: spot.owner, repo: spot.repo })
      await reload(target)
    }
    commitQueue.current = commitQueue.current
      .then(() => folderGit(target.files).commitBoundary())
      .then(() => performSync(target, spot))
      .then(
        () => undefined,
        () => undefined,
      )
  }

  const setView = (next: View) => {
    setViewState(next)
    history.replaceState(null, '', viewToHash(next, draftRef.current?.scene.id))
  }

  /** The sidebar legend navigates: back to the board, that lane in view. */
  const goToStoryline = (id: Slug) => {
    setView({ level: 'storylines' })
    requestAnimationFrame(() => {
      const label = document.querySelector<HTMLElement>(`.b-lanelabel[data-storyline="${id}"]`)
      label?.scrollIntoView?.({ block: 'center' })
    })
  }

  async function reload(target: OpenedFolder): Promise<void> {
    // A read can fail outright mid-swap; that's not a broken folder.
    // Keep the story as it stands — the next reload tells the truth.
    const result = await loadStory(target.files).catch(() => null)
    if (result === null) return
    if (result.ok) {
      setLoaded(result.loaded)
    } else {
      setFolder(null)
      setLoaded(null)
      setStartError(result.reason)
    }
  }

  // The watcher outlives renders; route its events through a ref so the
  // handler always sees current state.
  const onChangesRef = useRef<(paths: string[]) => void>(() => {})
  useEffect(() => {
    onChangesRef.current = (rawPaths) => {
      // The repository's own writes and Chromium's transient swap files
      // are not story changes.
      const paths = rawPaths.filter(
        (p) => p !== '.git' && !p.startsWith('.git/') && !p.endsWith('.crswap'),
      )
      if (!folder || paths.length === 0) return
      void (async () => {
        if (rawEdit && paths.includes(rawEdit.path)) {
          const diskText = await folder.files.readText(rawEdit.path).catch(() => null)
          if (diskText === null) {
            // Unreadable mid-write — the next event tells the truth.
          } else if (rawEdit.text !== rawEdit.savedText) {
            // The one conflict case: changed on disk under unsaved edits.
            setConflict({ path: rawEdit.path, diskText, appText: rawEdit.text })
          } else {
            setRawEdit({ ...rawEdit, text: diskText, savedText: diskText })
          }
        }
        if (draftRef.current && paths.includes(draftRef.current.path)) {
          // An auto-save may be mid-swap: let it land first, then judge
          // the disk against the draft as it stands afterwards.
          await pendingWrite.current?.catch(() => {})
          const current = draftRef.current
          if (current && paths.includes(current.path)) {
            let diskText = await folder.files.readText(current.path).catch(() => null)
            if (diskText !== null && diskText !== current.diskText) {
              // A swap-rename can serve yesterday's bytes once; only a
              // second read that still disagrees is a real external edit.
              diskText = await folder.files.readText(current.path).catch(() => null)
            }
            if (diskText === null || diskText === current.diskText) {
              // Unreadable mid-write, or the app's own save echoed back.
            } else if (isDirty(current)) {
              setConflict({ path: current.path, diskText, appText: serializeSceneFile(current.scene) })
            } else {
              replaceDraft(current, diskText)
            }
          }
        }
        const openNote = noteDraftRef.current
        if (openNote && paths.includes(notePath(openNote.note.id))) {
          // The notebook page follows the same rules as the scene draft.
          await pendingWrite.current?.catch(() => {})
          const now = noteDraftRef.current
          if (now && now.note.id === openNote.note.id) {
            const path = notePath(now.note.id)
            let diskText = await folder.files.readText(path).catch(() => null)
            if (diskText !== null && diskText !== now.diskText) {
              diskText = await folder.files.readText(path).catch(() => null)
            }
            if (diskText === null || diskText === now.diskText) {
              // Unreadable mid-write, or the app's own save echoed back.
            } else if (serializeNoteFile(now.note) !== now.diskText) {
              setConflict({ path, diskText, appText: serializeNoteFile(now.note) })
            } else {
              const parsed = parseNoteFile(now.note.id, diskText)
              if (parsed.ok) setNoteDraft({ note: parsed.note, diskText })
              else setNoteDraft(null) // malformed now — flagged at reload, edited raw
            }
          }
        }
        const openRef = refDraftRef.current
        if (openRef && paths.includes(referencePath(openRef.entity.kind, openRef.entity.id))) {
          // The library page follows the same rules as the notebook's.
          await pendingWrite.current?.catch(() => {})
          const now = refDraftRef.current
          if (now && now.entity.id === openRef.entity.id && now.entity.kind === openRef.entity.kind) {
            const path = referencePath(now.entity.kind, now.entity.id)
            let diskText = await folder.files.readText(path).catch(() => null)
            if (diskText !== null && diskText !== now.diskText) {
              diskText = await folder.files.readText(path).catch(() => null)
            }
            if (diskText === null || diskText === now.diskText) {
              // Unreadable mid-write, or the app's own save echoed back.
            } else if (serializeReferenceFile(now.entity) !== now.diskText) {
              setConflict({ path, diskText, appText: serializeReferenceFile(now.entity) })
            } else {
              const parsed = parseReferenceFile(now.entity.kind, now.entity.id, diskText)
              if (parsed.ok) setRefDraft({ entity: parsed.entity, diskText })
              else setRefDraft(null) // malformed now — flagged at reload, edited raw
            }
          }
        }
        await reload(folder)
      })()
    }
  })
  useEffect(() => {
    if (!folder) return
    return folder.watcher.watch((paths) => onChangesRef.current(paths))
  }, [folder])

  /** The disk moved and nothing is lost by following it. */
  function replaceDraft(current: Draft, text: string): void {
    const next = draftFromText(current.path, current.scene.id, text, current.revision + 1)
    if (next) setDraft(next)
    else closeScene() // now malformed: it gets flagged, and the raw editor takes over
  }

  /**
   * Lays a prior version of the open scene back onto the disk. It's an
   * edit like any other — the next boundary commits it, so restoring
   * never rewrites history, it adds to it.
   */
  async function restoreSceneVersion(text: string): Promise<void> {
    const current = draftRef.current
    if (!current || !folder) return
    clearTimeout(saveTimer.current)
    await folder.files.writeText(current.path, text)
    await folder.journal.clear(current.path)
    replaceDraft(current, text)
    await reload(folder)
  }

  /** Opens a notebook page, flushing whatever page was open first. */
  async function selectNote(id: Slug): Promise<void> {
    if (!folder) return
    await flushNote()
    const text = await folder.files.readText(notePath(id)).catch(() => null)
    if (text === null) return
    const parsed = parseNoteFile(id, text)
    if (parsed.ok) setNoteDraft({ note: parsed.note, diskText: text })
  }

  /** A notebook keystroke: the journal gets it now, the disk after the pause — scenes' rules. */
  function editNote(note: Note): void {
    const current = noteDraftRef.current
    if (!folder || !current || current.note.id !== note.id) return
    setNoteDraft({ ...current, note })
    void folder.journal.record({
      path: notePath(note.id),
      baseText: current.diskText,
      text: serializeNoteFile(note),
      at: Date.now(),
    })
    clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = window.setTimeout(() => void flushNote(), autosaveDelayMs)
  }

  async function flushNote(): Promise<void> {
    clearTimeout(noteSaveTimer.current)
    const current = noteDraftRef.current
    if (!current || !folder) return
    const text = serializeNoteFile(current.note)
    if (text === current.diskText) return
    const write = folder.files.writeText(notePath(current.note.id), text)
    pendingWrite.current = write.then(
      () => undefined,
      () => undefined,
    )
    await write
    const after = noteDraftRef.current
    if (after && after.note.id === current.note.id) {
      setNoteDraft({ ...after, diskText: text })
      if (serializeNoteFile(after.note) !== text) {
        noteSaveTimer.current = window.setTimeout(() => void flushNote(), autosaveDelayMs)
        return
      }
    }
    await folder.journal.clear(notePath(current.note.id))
    await reload(folder)
  }

  /** Opens a library page, flushing whatever page was open first. */
  async function selectReference(kind: ReferenceKind, id: Slug): Promise<void> {
    if (!folder) return
    await flushReference()
    const text = await folder.files.readText(referencePath(kind, id)).catch(() => null)
    if (text === null) return
    const parsed = parseReferenceFile(kind, id, text)
    if (parsed.ok) setRefDraft({ entity: parsed.entity, diskText: text })
  }

  /** A library keystroke: the journal gets it now, the disk after the pause — the notebook's rules. */
  function editReference(entity: ReferenceEntity): void {
    const current = refDraftRef.current
    if (!folder || !current || current.entity.id !== entity.id || current.entity.kind !== entity.kind) return
    setRefDraft({ ...current, entity })
    void folder.journal.record({
      path: referencePath(entity.kind, entity.id),
      baseText: current.diskText,
      text: serializeReferenceFile(entity),
      at: Date.now(),
    })
    clearTimeout(refSaveTimer.current)
    refSaveTimer.current = window.setTimeout(() => void flushReference(), autosaveDelayMs)
  }

  async function flushReference(): Promise<void> {
    clearTimeout(refSaveTimer.current)
    const current = refDraftRef.current
    if (!current || !folder) return
    const text = serializeReferenceFile(current.entity)
    if (text === current.diskText) return
    const path = referencePath(current.entity.kind, current.entity.id)
    const write = folder.files.writeText(path, text)
    pendingWrite.current = write.then(
      () => undefined,
      () => undefined,
    )
    await write
    const after = refDraftRef.current
    if (after && after.entity.id === current.entity.id && after.entity.kind === current.entity.kind) {
      setRefDraft({ ...after, diskText: text })
      if (serializeReferenceFile(after.entity) !== text) {
        refSaveTimer.current = window.setTimeout(() => void flushReference(), autosaveDelayMs)
        return
      }
    }
    await folder.journal.clear(path)
    await reload(folder)
  }

  async function createReferenceAction(kind: ReferenceKind, title: string): Promise<void> {
    if (!folder) return
    await flushReference()
    const id = await createReference(folder.files, kind, title)
    await reload(folder)
    await selectReference(kind, id)
  }

  async function deleteReferenceAction(): Promise<void> {
    const current = refDraftRef.current
    if (!current || !folder) return
    clearTimeout(refSaveTimer.current)
    setRefDraft(null)
    await folder.journal.clear(referencePath(current.entity.kind, current.entity.id))
    await deleteReference(folder.files, current.entity.kind, current.entity.id)
    await reload(folder)
  }

  /** Stores picked image files under assets/ and pins them to the open library page. */
  async function addImagesToReference(picked: File[]): Promise<void> {
    const current = refDraftRef.current
    if (!current || !folder) return
    const paths: string[] = []
    for (const file of picked) {
      paths.push(await storeAsset(folder.files, file.name, new Uint8Array(await file.arrayBuffer())))
    }
    const latest = refDraftRef.current
    if (latest && latest.entity.id === current.entity.id && latest.entity.kind === current.entity.kind) {
      editReference({ ...latest.entity, images: [...latest.entity.images, ...paths] })
    }
  }

  /** The same, for the open scene. */
  async function addImagesToScene(picked: File[]): Promise<void> {
    const current = draftRef.current
    if (!current || !folder) return
    const paths: string[] = []
    for (const file of picked) {
      paths.push(await storeAsset(folder.files, file.name, new Uint8Array(await file.arrayBuffer())))
    }
    const latest = draftRef.current
    if (latest && latest.path === current.path) {
      editScene({ ...latest.scene, images: [...latest.scene.images, ...paths] })
    }
  }

  async function createNoteAction(title: string, section: string): Promise<void> {
    if (!folder) return
    await flushNote()
    const id = await createNote(folder.files, title, section === '' ? undefined : section)
    await reload(folder)
    await selectNote(id)
  }

  async function createSectionAction(path: string): Promise<void> {
    if (!folder) return
    await addNotebookSection(folder.files, path)
    await reload(folder)
  }

  async function deleteNoteAction(): Promise<void> {
    const current = noteDraftRef.current
    if (!current || !folder) return
    clearTimeout(noteSaveTimer.current)
    setNoteDraft(null)
    await folder.journal.clear(notePath(current.note.id))
    await deleteNote(folder.files, current.note.id)
    await reload(folder)
  }

  /**
   * Runs a picker (or recent reopen) and opens the result. Every failure
   * lands in startError — a discarded error here would leave the start
   * screen sitting on a stale message with nothing happening.
   */
  async function pickAndOpen(source: () => Promise<OpenedFolder | null>): Promise<void> {
    let opened: OpenedFolder | null
    try {
      opened = await source()
    } catch (error) {
      setStartError((error as Error).message)
      return
    }
    if (!opened) return // dismissed the picker; leave the screen as it was
    try {
      await open(opened)
    } catch (error) {
      setStartError(`Could not open the folder: ${(error as Error).message}`)
    }
  }

  async function open(opened: OpenedFolder): Promise<void> {
    setEmptyFolder(null)
    if (!(await opened.files.exists('story.json'))) {
      setStartError('This folder has no story.json — not a story folder yet.')
      setEmptyFolder(opened)
      return
    }
    // Whatever a crash left in the journal lands on disk before the story
    // loads, so the board never shows a version the writer has moved past.
    const conflicts = await reconcileJournal(opened.files, opened.journal)
    const result = await loadStory(opened.files)
    if (!result.ok) {
      setStartError(result.reason)
      return
    }
    setStartError(null)
    setFolder(opened)
    setLoaded(result.loaded)
    const { manifest, scenes } = result.loaded.story
    const initialView = readViewFromHash(location.hash, (id: Slug) => manifest.acts.some((a) => a.id === id))
    setViewState(initialView)
    const sceneId = readSceneFromHash(location.hash, (id) => scenes.has(id))
    const initialDraft = sceneId === undefined ? null : await readDraft(opened, sceneId)
    setDraft(initialDraft)
    history.replaceState(null, '', viewToHash(initialView, initialDraft?.scene.id))
    queuedConflicts.current = conflicts.slice(1)
    setConflict(conflicts[0] ?? null)
    await platform.rememberOpened(opened).catch(() => {})
    // Opening is a boundary: the first ever commit sweeps the folder as
    // it stands; a reopen commits whatever changed while the app was
    // away — and with a remote configured, sync follows, pull first.
    boundaryCommit(opened, result.loaded.story.manifest)
  }

  /**
   * Back to the start screen. Everything the app does when a scene, note,
   * or page is left — flush the draft, let the boundary commit land —
   * then the folder is released: the watcher stops with it (the effect
   * below cleans up), the view resets, and the recents list is read
   * again so the story just left is at the top of it.
   */
  async function goHome(): Promise<void> {
    if (!folder) return
    await flush()
    await flushNote()
    await flushReference()
    boundaryCommit()
    setDraft(null)
    setNoteDraft(null)
    setRefDraft(null)
    setRawEdit(null)
    setConflict(null)
    queuedConflicts.current = []
    setCreating(null)
    setEditing(null)
    setPoolOpen(false)
    setExportState(null)
    setSyncStatus(null)
    setStartError(null)
    setFolder(null)
    setLoaded(null)
    setViewState({ level: 'storylines' })
    history.replaceState(null, '', '#')
    setRecents(await platform.recents())
  }

  /** Starts a story in the picked folder — bare, or scaffolded from a template — then opens it like any other. */
  async function startNewStory(template?: string): Promise<void> {
    if (!emptyFolder) return
    try {
      await applyTemplate(emptyFolder.files, emptyFolder.name, template)
      await open(emptyFolder)
    } catch (error) {
      setStartError(`Could not start a story there: ${(error as Error).message}`)
    }
  }

  /** The scene as the file holds it right now — the editor works from disk, not memory. */
  async function readDraft(target: OpenedFolder, id: Slug): Promise<Draft | null> {
    const path = `scenes/${id}.md`
    const text = await target.files.readText(path).catch(() => null)
    return text === null ? null : draftFromText(path, id, text, 0)
  }

  async function openScene(id: Slug): Promise<void> {
    if (!folder) return
    await flush()
    boundaryCommit() // switching scenes is a boundary
    const next = await readDraft(folder, id)
    if (!next) return
    setDraft(next)
    history.replaceState(null, '', viewToHash(view, id))
  }

  function closeScene(): void {
    void flush().then(() => boundaryCommit())
    setDraft(null)
    history.replaceState(null, '', viewToHash(view))
  }

  /** A keystroke: the journal gets it now, the disk after the pause. */
  function editScene(scene: Scene): void {
    const current = draftRef.current
    if (!current || !folder) return
    setDraft({ ...current, scene })
    void folder.journal.record({
      path: current.path,
      baseText: current.diskText,
      text: serializeSceneFile(scene),
      at: Date.now(),
    })
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flush(), autosaveDelayMs)
  }

  /**
   * Writes the draft if it has moved past the disk. The write is atomic
   * at the adapter (swap file, then rename). The journal clears only
   * once the write is confirmed — and only if nothing was typed during
   * it; otherwise the newer keystrokes are re-journaled against the text
   * just written.
   */
  async function flush(): Promise<void> {
    clearTimeout(saveTimer.current)
    const current = draftRef.current
    if (!current || !folder || !isDirty(current)) return
    const text = serializeSceneFile(current.scene)
    const write = folder.files.writeText(current.path, text)
    pendingWrite.current = write.then(
      () => undefined,
      () => undefined,
    )
    await write
    const after = draftRef.current
    if (after && after.path === current.path) {
      setDraft({ ...after, diskText: text, cleanText: text })
      const newer = serializeSceneFile(after.scene)
      if (newer !== text) {
        await folder.journal.record({ path: current.path, baseText: text, text: newer, at: Date.now() })
        saveTimer.current = window.setTimeout(() => void flush(), autosaveDelayMs)
        return
      }
    }
    await folder.journal.clear(current.path)
    await reload(folder)
  }

  /**
   * Places the open scene. The draft is flushed first so the placement
   * writes over the latest text, then the draft is rebuilt from the file
   * as written; anything typed during the write is laid back over it.
   */
  async function placeOpenScene(placement: Placement): Promise<void> {
    const current = draftRef.current
    if (!current || !folder) return
    await flush()
    const flushed = draftRef.current
    if (!flushed || flushed.path !== current.path) return
    await placeScene(folder.files, flushed.scene.id, placement)
    const text = await folder.files.readText(flushed.path)
    const next = draftFromText(flushed.path, flushed.scene.id, text, flushed.revision)
    const latest = draftRef.current
    if (next && latest && latest.path === flushed.path) {
      const typedMeanwhile = latest.scene !== flushed.scene
      setDraft(typedMeanwhile ? { ...next, scene: { ...latest.scene, storylines: placement.storylines, act: placement.act } } : next)
      if (typedMeanwhile) saveTimer.current = window.setTimeout(() => void flush(), autosaveDelayMs)
    }
    await reload(folder)
  }

  /** Places any scene — through the draft when it's the open one, straight to disk otherwise. */
  async function placeAnyScene(id: Slug, placement: Placement): Promise<void> {
    if (!folder) return
    setDragging(null)
    if (draftRef.current?.scene.id === id) {
      await placeOpenScene(placement)
      return
    }
    await placeScene(folder.files, id, placement)
    await reload(folder)
  }

  /** Deletes the open scene: the editor closes, its journal entry is spent, the file goes. */
  async function deleteOpenScene(): Promise<void> {
    const current = draftRef.current
    if (!current || !folder) return
    clearTimeout(saveTimer.current)
    setDraft(null)
    history.replaceState(null, '', viewToHash(view))
    await folder.journal.clear(current.path)
    await deleteScene(folder.files, current.scene.id)
    await reload(folder)
  }

  const boardScrollerRef = useRef<HTMLDivElement | null>(null)

  // ←/→ walks act to act: scroll jumps on the board, view steps in act zoom.
  const jumpAct = (direction: 1 | -1) => {
    if (!loaded) return
    const acts = loaded.story.manifest.acts
    if (view.level === 'act') {
      const i = acts.findIndex((a) => a.id === view.act) + direction
      if (acts[i]) setView({ level: 'act', act: acts[i].id })
      return
    }
    const el = boardScrollerRef.current
    if (!el) return
    const layout = layoutBoard(loaded.story.manifest, loaded.story.scenes)
    const offsets = layout.actRanges.map(({ start }) => Math.max(0, start * BOARD_PITCH - 34))
    const current = el.scrollLeft
    let target: number | undefined
    if (direction > 0) target = offsets.find((o) => o > current + 10)
    else target = offsets.filter((o) => o < current - 10).pop()
    el.scrollTo({ left: target ?? (direction > 0 ? (offsets.at(-1) ?? 0) : 0), behavior: 'smooth' })
  }

  async function openRawEditor(path: string, message: string): Promise<void> {
    if (!folder) return
    const text = await folder.files.readText(path).catch(() => '')
    setRawEdit({ path, message, text, savedText: text })
  }

  async function saveRawEdit(): Promise<void> {
    if (!folder || !rawEdit) return
    await folder.files.writeText(rawEdit.path, rawEdit.text)
    setRawEdit(null)
    await reload(folder)
  }

  /**
   * Settles the side-by-side view for whichever editor (raw, scene, or a
   * journal entry from a past crash) the file belongs to. The journal
   * entry for the path is spent either way: kept-mine is on disk now,
   * and take-disk was the writer's call.
   */
  async function resolveConflict(choice: 'disk' | 'mine', mineText: string): Promise<void> {
    if (!folder || !conflict) return
    const { path } = conflict
    const text = choice === 'mine' ? mineText : conflict.diskText
    // Written either way: for a disk conflict the disk text is already
    // there (a no-op); for a sync overlap the remote's text is not.
    await folder.files.writeText(path, text)
    await folder.journal.clear(path)
    if (rawEdit && rawEdit.path === path) {
      if (choice === 'mine') setRawEdit(null)
      else setRawEdit({ ...rawEdit, text, savedText: text })
    }
    const current = draftRef.current
    if (current && current.path === path) replaceDraft(current, text)
    const openNote = noteDraftRef.current
    if (openNote && notePath(openNote.note.id) === path) {
      const parsed = parseNoteFile(openNote.note.id, text)
      if (parsed.ok) setNoteDraft({ note: parsed.note, diskText: text })
      else setNoteDraft(null)
    }
    const openRef = refDraftRef.current
    if (openRef && referencePath(openRef.entity.kind, openRef.entity.id) === path) {
      const parsed = parseReferenceFile(openRef.entity.kind, openRef.entity.id, text)
      if (parsed.ok) setRefDraft({ entity: parsed.entity, diskText: text })
      else setRefDraft(null)
    }
    const next = queuedConflicts.current.shift() ?? null
    setConflict(next)
    if (!next && pendingMergeHead.current) {
      // Every overlap settled: record the merge commit, then push it.
      const remoteHead = pendingMergeHead.current
      pendingMergeHead.current = null
      const { files } = folder
      const target = folder
      const spot = spotFrom(loaded?.story.manifest)
      commitQueue.current = commitQueue.current
        .then(() => completeMerge(files, remoteHead, DEFAULT_IDENT))
        .then(() => (spot ? performSync(target, spot) : undefined))
        .then(() => undefined, () => undefined)
    }
    await reload(folder)
  }

  /** Runs a creation op, then reloads — disk is the source of truth. */
  async function create(run: () => Promise<unknown>): Promise<void> {
    if (!folder) return
    await run()
    setCreating(null)
    await reload(folder)
  }

  /** Writes an engine file (the registry, a playthrough), then reloads. */
  async function writeEngine(run: () => Promise<unknown>): Promise<void> {
    if (!folder) return
    await run()
    await reload(folder)
  }

  /** Runs a structural op, then reloads; the dialog closes unless told to stay. */
  async function restructure(run: () => Promise<unknown>, keepOpen = false): Promise<void> {
    if (!folder) return
    await run()
    if (!keepOpen) setEditing(null)
    await reload(folder)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (conflict) return // a conflict wants a decision, not a dismissal
        if (liftOffers) {
          setLiftOffers(null) // Esc keeps everything as prose
          return
        }
        if (creating || editing || checkpointOpen || importOpen) {
          setCreating(null)
          setEditing(null)
          setCheckpointOpen(false)
          setImportOpen(false)
          return
        }
        if (rawEdit) {
          if (rawEdit.text === rawEdit.savedText) setRawEdit(null)
          return
        }
        if (view.level === 'notes' && noteDraftRef.current) {
          void flushNote().then(() => setNoteDraft(null))
          return
        }
        if (view.level === 'library' && refDraftRef.current) {
          void flushReference().then(() => setRefDraft(null))
          return
        }
        if (draft) closeScene()
        else if (poolOpen) setPoolOpen(false)
        else if (view.level !== 'storylines') setView({ level: 'storylines' })
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (draft) return
        const target = e.target as HTMLElement | null
        if (target?.closest('input,textarea,[contenteditable]')) return
        if (view.level !== 'storylines' && view.level !== 'act') return
        e.preventDefault()
        jumpAct(e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!folder || !loaded) {
    return (
      <>
        <StartScreen
          recents={recents}
          error={startError}
          emptyFolder={emptyFolder?.name ?? null}
          onPick={() => void pickAndOpen(() => platform.pickFolder())}
          onOpenRecent={(name) => void pickAndOpen(() => platform.openRecent(name))}
          onStartNew={(template) => void startNewStory(template)}
          onPullRemote={() => setPullOpen(true)}
          onImport={() => setImportOpen(true)}
        />
        {pullOpen && <PullDialog onPull={(spot) => void pullIntoEmpty(spot)} onCancel={() => setPullOpen(false)} />}
        {importOpen && (
          <ImportDialog onFile={(file) => void importStoryFile(file)} onCancel={() => setImportOpen(false)} />
        )}
      </>
    )
  }

  const { story, problems } = loaded
  const poolScenes = [...story.scenes.values()]
    .filter((s) => s.storylines.length === 0)
    .sort((a, b) => a.title.localeCompare(b.title))
  const onOpenScene = (id: Slug) => void openScene(id)

  return (
    <div className="app-shell">
      <Sidebar
        title={story.manifest.title}
        manifest={story.manifest}
        view={view}
        poolOpen={poolOpen}
        poolCount={poolScenes.length}
        onView={setView}
        onTogglePool={() => setPoolOpen(!poolOpen)}
        onEditStoryline={(id) => setEditing({ kind: 'storyline', id })}
        onGoStoryline={goToStoryline}
        onEditAct={(id) => setEditing({ kind: 'act', id })}
        onCheckpoint={() => setCheckpointOpen(true)}
        onHome={() => void goHome()}
        variableCount={story.registry.variables.length}
        noteCount={story.notes.size}
        referenceCount={story.references.size}
        findingCount={findings.length}
      >
        <div className="sb-sect">New</div>
        <button className="sb-item" onClick={() => setCreating('scene')}>
          + New scene
        </button>
        <button className="sb-item" onClick={() => setCreating('act')}>
          + New act
        </button>
        <button className="sb-item" onClick={() => setCreating('storyline')}>
          + New storyline
        </button>
        <div className="sb-sect">Export</div>
        <button className="sb-item" onClick={() => void exportStory()}>
          ⬇ Playable HTML
        </button>
        {exportState && folder && <ExportNote state={exportState} folder={folder} />}
      </Sidebar>
      <main className="app-main">
        <ProblemsBar
          problems={problems}
          onEdit={(problem) => void openRawEditor(problem.path, problem.message)}
        />
        {view.level === 'storylines' && (
          <Board
            story={story}
            dragging={dragging}
            onZoomAct={(act) => setView({ level: 'act', act })}
            onEditAct={(id) => setEditing({ kind: 'act', id })}
            onEditStoryline={(id) => setEditing({ kind: 'storyline', id })}
            onOpenScene={onOpenScene}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onPlace={(id, placement) => void placeAnyScene(id, placement)}
            scrollerRef={boardScrollerRef}
          />
        )}
        {view.level === 'overview' && (
          <Overview story={story} onZoomAct={(act) => setView({ level: 'act', act })} onOpenScene={onOpenScene} />
        )}
        {view.level === 'act' && (
          <ActView story={story} actId={view.act} onView={setView} onOpenScene={onOpenScene} />
        )}
        {view.level === 'graph' && <GraphView story={story} onOpenScene={onOpenScene} />}
        {view.level === 'coach' && <CoachView story={story} />}
        {view.level === 'variables' && (
          <VariablesView
            story={story}
            onSave={(registry: VariableRegistry) => void writeEngine(() => saveRegistry(folder.files, registry))}
            onOpenScene={onOpenScene}
          />
        )}
        {view.level === 'simulate' && (
          <SimulateView
            story={story}
            onOpenScene={onOpenScene}
            onSavePlaythrough={(playthrough: Playthrough) => void writeEngine(() => savePlaythrough(folder.files, playthrough))}
            onDeletePlaythrough={(name) => void writeEngine(() => deletePlaythrough(folder.files, name))}
          />
        )}
        {view.level === 'analysis' && <AnalysisView story={story} findings={findings} onOpenScene={onOpenScene} />}
        {view.level === 'history' && git && <HistoryView git={git} />}
        {view.level === 'notes' && (
          <NotesView
            story={story}
            selected={noteDraft?.note ?? null}
            onSelect={(id) => void selectNote(id)}
            onCreate={(title, section) => void createNoteAction(title, section)}
            onCreateSection={(path) => void createSectionAction(path)}
            onEdit={editNote}
            onDelete={() => void deleteNoteAction()}
          />
        )}
        {view.level === 'stats' && (
          <StatsView
            story={story}
            onSetGoal={(words) => void setWordGoal(folder.files, words).then(() => reload(folder))}
          />
        )}
        {view.level === 'search' && (
          <SearchView
            story={story}
            onOpen={(hit) => {
              if (hit.kind === 'scene') void onOpenScene(hit.id)
              else if (hit.kind === 'note') {
                setView({ level: 'notes' })
                void selectNote(hit.id)
              } else {
                setView({ level: 'library' })
                void selectReference(hit.kind, hit.id)
              }
            }}
          />
        )}
        {view.level === 'library' && (
          <LibraryView
            story={story}
            files={folder.files}
            selected={refDraft?.entity ?? null}
            onSelect={(kind, id) => void selectReference(kind, id)}
            onCreate={(kind, title) => void createReferenceAction(kind, title)}
            onEdit={editReference}
            onAddImages={(picked) => void addImagesToReference(picked)}
            onDelete={() => void deleteReferenceAction()}
          />
        )}
        {view.level === 'sync' && (
          <SyncView
            settings={(story.manifest.settings as { sync?: SyncSettings }).sync ?? null}
            token={localStorage.getItem(TOKEN_KEY) ?? ''}
            status={syncStatus}
            onSave={(spot) => void saveSync(spot)}
          />
        )}
      </main>
      {poolOpen && (
        <PoolDrawer
          scenes={poolScenes}
          dragging={dragging}
          onOpenScene={onOpenScene}
          onDragStart={setDragging}
          onDragEnd={() => setDragging(null)}
          onDropToPool={(id) => void placeAnyScene(id, { storylines: [], act: story.scenes.get(id)?.act })}
        />
      )}
      {view.level === 'storylines' && <Minimap story={story} scroller={boardScrollerRef} />}
      {draft && git && (
        <SceneEditor
          story={story}
          scene={draft.scene}
          revision={draft.revision}
          onChange={editScene}
          onPlace={(placement) => void placeOpenScene(placement)}
          onDelete={() => void deleteOpenScene()}
          onClose={closeScene}
          onOpenScene={onOpenScene}
          files={folder.files}
          git={git}
          onRestore={(text) => void restoreSceneVersion(text)}
          onAddImages={(picked) => void addImagesToScene(picked)}
        />
      )}
      {rawEdit && (
        <RawEditor
          path={rawEdit.path}
          message={rawEdit.message}
          text={rawEdit.text}
          dirty={rawEdit.text !== rawEdit.savedText}
          onChange={(text) => setRawEdit({ ...rawEdit, text })}
          onSave={() => void saveRawEdit()}
          onClose={() => setRawEdit(null)}
        />
      )}
      {conflict && (
        <ConflictView
          path={conflict.path}
          diskText={conflict.diskText}
          appText={conflict.appText}
          onResolve={(choice, mineText) => void resolveConflict(choice, mineText)}
        />
      )}
      {checkpointOpen && (
        <CheckpointDialog onCommit={commitCheckpoint} onClose={() => setCheckpointOpen(false)} />
      )}
      {liftOffers && (
        <LiftDialog
          suggestions={liftOffers}
          onApply={(chosen) => void applyLifts(chosen)}
          onKeep={() => setLiftOffers(null)}
        />
      )}
      {creating === 'scene' && (
        <NewSceneDialog
          manifest={story.manifest}
          onCreate={(spec) => void create(() => createScene(folder.files, spec))}
          onCancel={() => setCreating(null)}
        />
      )}
      {creating === 'act' && (
        <NewActDialog
          onCreate={(title) => void create(() => createAct(folder.files, title))}
          onCancel={() => setCreating(null)}
        />
      )}
      {creating === 'storyline' && (
        <NewStorylineDialog
          manifest={story.manifest}
          onCreate={(spec) => void create(() => createStoryline(folder.files, spec))}
          onCancel={() => setCreating(null)}
        />
      )}
      {editing?.kind === 'storyline' && (
        <EditStorylineDialog
          key={editing.id}
          story={story}
          id={editing.id}
          onSave={(patch) => void restructure(() => updateStoryline(folder.files, editing.id, patch))}
          onMove={(toIndex) => void restructure(() => moveStoryline(folder.files, editing.id, toIndex), true)}
          onDelete={() => void restructure(() => deleteStoryline(folder.files, editing.id))}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'act' && (
        <EditActDialog
          key={editing.id}
          story={story}
          id={editing.id}
          onSave={(title) => void restructure(() => renameAct(folder.files, editing.id, title))}
          onMove={(toIndex) => void restructure(() => moveAct(folder.files, editing.id, toIndex), true)}
          onDelete={() => void restructure(() => deleteAct(folder.files, editing.id))}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
