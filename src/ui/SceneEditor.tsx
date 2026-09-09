import { useEffect, useRef, useState } from 'react'
import type { FileAccess, GitClient, GitCommit } from '../adapters/types'
import type { Scene, Slug, Story, TargetKey } from '../domain/types'
import { insertBeat, moveBeat, removeBeat, setBeat } from '../editor/beats'
import type { MentionContext } from '../mentions/context'
import type { Target } from '../mentions/match'
import { NamedIn } from './NamedIn'
import { ReadButton } from './ReadButton'
import { ReadOutcome, type ReadInfo } from './ReadOutcome'
import type { Placement } from '../story/mutations'
import { EngineEditor } from './EngineEditor'
import { MoodBoard } from './MoodBoard'
import { ProseEditor } from './ProseEditor'
import { Glyph } from './SceneBadges'

/**
 * The slide-over editor: distraction-free title, placement, engine block,
 * synopsis, beats, and prose. It holds no state of its own — every text
 * change goes up as a whole new scene, and the host journals and saves
 * it; placement goes up separately, because it also touches the manifest.
 */
export function SceneEditor({
  story,
  scene,
  revision,
  onChange,
  onPlace,
  onDelete,
  onClose,
  onOpenScene,
  files,
  git,
  onRestore,
  onAddImages,
  mentions,
  namedIn = [],
  onOpenTarget = () => {},
  canRead = false,
  reading = false,
  readProblem = null,
  onRead,
  onCancelRead,
  read = null,
}: {
  story: Story
  scene: Scene
  /** Bumps whenever the scene was replaced from disk, so the prose remounts. */
  revision: number
  onChange: (scene: Scene) => void
  onPlace: (placement: Placement) => void
  onDelete: () => void
  onClose: () => void
  onOpenScene: (id: Slug) => void
  files: FileAccess
  git: GitClient
  /** Lays a prior version's text back onto the disk, as an edit. */
  onRestore: (text: string) => void
  /** Stores the picked files under assets/ and pins them to this scene. */
  onAddImages: (picked: File[]) => void
  /** What the prose names, and what to do about it; absent before a story is loaded. */
  mentions?: MentionContext
  /** Everywhere this scene is named by title, most often first. */
  namedIn?: Target[]
  onOpenTarget?: (key: TargetKey) => void
  /** Whether Claude Code can be reached for a read. */
  canRead?: boolean
  /** A read of this scene is in flight. */
  reading?: boolean
  /** Why the last read failed, when it did. */
  readProblem?: string | null
  /** Sends this scene to the read now, whether or not it changed. */
  onRead?: () => void
  onCancelRead?: () => void
  /** What the last read of this scene found. */
  read?: ReadInfo | null
}) {
  const { manifest } = story
  const act = manifest.acts.find((a) => a.id === scene.act)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Per-scene history: the commits touching this file, and the version
  // under inspection. Restore hands the old text up; it lands as an edit.
  const [history, setHistory] = useState<GitCommit[] | null>(null)
  const [viewing, setViewing] = useState<{ sha: string; text: string } | null>(null)
  const path = `scenes/${scene.id}.md`

  const toggleHistory = async () => {
    if (history) {
      setHistory(null)
      setViewing(null)
      return
    }
    setHistory(await git.log({ path }))
  }

  const viewVersion = async (sha: string) =>
    setViewing({ sha, text: (await git.readFileAt(sha, path)) ?? '' })

  const toggleStoryline = (id: Slug, on: boolean) =>
    onPlace({
      storylines: on ? [...scene.storylines, id] : scene.storylines.filter((s) => s !== id),
      act: scene.act,
    })

  // Beat inputs: focus lands where the last edit put it (a new beat after
  // Enter, the previous beat after deleting an empty one).
  const beatRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusBeat = useRef<number | null>(null)
  useEffect(() => {
    if (focusBeat.current === null) return
    beatRefs.current[focusBeat.current]?.focus()
    focusBeat.current = null
  })

  const addBeatAfter = (index: number) => {
    onChange(insertBeat(scene, index + 1))
    focusBeat.current = index + 1
  }

  return (
    <div className="ed-root">
      <div className="ed-backdrop" onClick={onClose} />
      <section role="dialog" aria-label="Scene editor" className="ed-slide">
        <div className="ed-inner">
          <div className="ed-top">
            <button className="backbtn" onClick={onClose}>
              ← Board
            </button>
            <button className="ed-histbtn" onClick={() => void toggleHistory()}>
              History
            </button>
            {onRead && <ReadButton what="scene" canRead={canRead} reading={reading} readProblem={readProblem} onRead={onRead} onCancel={onCancelRead} />}
            {scene.characters.length > 0 && <span className="ed-chips">👤 {scene.characters.join(', ')}</span>}
          </div>
          {history && (
            <div className="ed-section ed-history">
              <label>Scene history</label>
              {history.length === 0 && <p className="ed-pool">No commit holds this scene yet.</p>}
              <ol className="ed-histlist">
                {history.map((commit) => (
                  <li key={commit.id}>
                    <button
                      className={`ed-histver ${viewing?.sha === commit.id ? 'active' : ''}`}
                      aria-label={`Version from ${new Date(commit.time * 1000).toLocaleString()}`}
                      onClick={() => void viewVersion(commit.id)}
                    >
                      <span className="ed-histtime">{new Date(commit.time * 1000).toLocaleString()}</span>
                      {commit.message}
                    </button>
                  </li>
                ))}
              </ol>
              {viewing && (
                <div className="ed-version" role="region" aria-label="Version preview">
                  <pre>{viewing.text}</pre>
                  <button
                    onClick={() => {
                      onRestore(viewing.text)
                      setHistory(null)
                      setViewing(null)
                    }}
                  >
                    Restore this version
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="ed-place" aria-label="Placement">
            <span className="ed-place-label">In</span>
            {manifest.storylines.map((line) => {
              const on = scene.storylines.includes(line.id)
              return (
                <label key={line.id} className={`ed-member ${on ? 'on' : ''}`} style={on ? { borderColor: line.color } : undefined}>
                  <input type="checkbox" checked={on} onChange={(e) => toggleStoryline(line.id, e.target.checked)} />
                  <Glyph color={line.color} glyph={line.glyph} /> {line.name}
                </label>
              )
            })}
            {scene.storylines.length === 0 && <span className="ed-pool">Idea pool — unplaced</span>}
            <label className="ed-act">
              <span>Act</span>
              <select
                value={scene.act ?? ''}
                onChange={(e) => onPlace({ storylines: scene.storylines, act: e.target.value || undefined })}
              >
                <option value="">— none —</option>
                {manifest.acts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            {act === undefined && scene.act !== undefined && <span className="ed-pool">act `{scene.act}` is not in story.json</span>}
          </div>
          <input
            className="ed-title"
            aria-label="Title"
            value={scene.title}
            onChange={(e) => onChange({ ...scene, title: e.target.value })}
          />
          <EngineEditor scene={scene} story={story} revision={revision} onChange={onChange} onOpenScene={onOpenScene} />
          <div className="ed-section">
            <label htmlFor="ed-synopsis">Synopsis</label>
            <textarea
              id="ed-synopsis"
              className="ed-synopsis"
              placeholder="One or two sentences of what this scene is."
              value={scene.synopsis}
              rows={Math.max(2, scene.synopsis.split('\n').length)}
              onChange={(e) => onChange({ ...scene, synopsis: e.target.value })}
            />
          </div>
          <div className="ed-section">
            <label>Beats</label>
            <ol className="ed-beats">
              {scene.beats.map((beat, i) => (
                <li key={i}>
                  <input
                    ref={(el) => {
                      beatRefs.current[i] = el
                    }}
                    aria-label={`Beat ${i + 1}`}
                    value={beat}
                    onChange={(e) => onChange(setBeat(scene, i, e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addBeatAfter(i)
                      } else if (e.key === 'Backspace' && beat === '') {
                        e.preventDefault()
                        onChange(removeBeat(scene, i))
                        focusBeat.current = Math.max(0, i - 1)
                      }
                    }}
                  />
                  <span className="ed-beat-tools">
                    <button
                      aria-label={`Move beat ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => onChange(moveBeat(scene, i, i - 1))}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move beat ${i + 1} down`}
                      disabled={i === scene.beats.length - 1}
                      onClick={() => onChange(moveBeat(scene, i, i + 1))}
                    >
                      ↓
                    </button>
                    <button aria-label={`Remove beat ${i + 1}`} onClick={() => onChange(removeBeat(scene, i))}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <button className="ed-addbeat" onClick={() => addBeatAfter(scene.beats.length - 1)}>
              + beat
            </button>
          </div>
          <div className="ed-section">
            <label>Prose</label>
            <ReadOutcome read={read} />
            <ProseEditor
              key={`${scene.id}:${revision}`}
              markdown={scene.prose}
              onChange={(prose) => onChange({ ...scene, prose })}
              mentions={mentions}
            />
          </div>
          <NamedIn items={namedIn} onOpen={onOpenTarget} />
          <MoodBoard
            images={scene.images}
            files={files}
            onAdd={onAddImages}
            onRemove={(path) => onChange({ ...scene, images: scene.images.filter((p) => p !== path) })}
          />
          <div className="ed-section danger-zone">
            {!confirmingDelete ? (
              <button type="button" className="danger-link" onClick={() => setConfirmingDelete(true)}>
                Delete scene…
              </button>
            ) : (
              <>
                <p>
                  The file scenes/{scene.id}.md goes and every storyline drops it. A choice elsewhere that
                  leads here is left as written and flagged, so nothing is cut behind your back.
                </p>
                <div className="create-actions">
                  <button type="button" className="danger" onClick={onDelete}>
                    Delete scene
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)}>
                    Keep it
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
