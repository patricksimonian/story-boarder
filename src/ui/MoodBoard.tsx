import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileAccess } from '../adapters/types'
import { SketchPad } from './SketchPad'

/**
 * The mood board: the images attached to a scene or reference entity.
 * Bytes live under assets/; the owning file's frontmatter carries the
 * paths. Removing an image drops the path and leaves the asset — other
 * pages may pin the same picture.
 */
export function MoodBoard({
  images,
  files,
  onAdd,
  onRemove,
}: {
  images: string[]
  files: FileAccess
  onAdd: (picked: File[]) => void
  onRemove: (path: string) => void
}) {
  const [sketching, setSketching] = useState(false)
  return (
    <div className="ed-section">
      <h3>Mood board</h3>
      <div className="flex flex-wrap gap-2">
        {images.map((path) => (
          <BoardImage key={path} path={path} files={files} onRemove={() => onRemove(path)} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4">
        <label className="inline-block cursor-pointer text-sm underline">
          Add images
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="Add images"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])]
              e.target.value = ''
              if (picked.length) onAdd(picked)
            }}
          />
        </label>
        {!sketching && (
          <button type="button" className="cursor-pointer text-sm underline" onClick={() => setSketching(true)}>
            Sketch a panel
          </button>
        )}
      </div>
      {sketching && (
        <SketchPad
          onSave={(svgText) => {
            onAdd([new File([svgText], 'sketch.svg', { type: 'image/svg+xml' })])
            setSketching(false)
          }}
          onClose={() => setSketching(false)}
        />
      )}
    </div>
  )
}

/** An <img> only renders an SVG blob when the MIME says so; the rest are happy either way. */
function mimeOf(path: string): string {
  const ext = path.split('.').at(-1)?.toLowerCase()
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return `image/${ext ?? 'png'}`
}

function BoardImage({ path, files, onRemove }: { path: string; files: FileAccess; onRemove: () => void }) {
  const name = path.split('/').at(-1) ?? path
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let revoked: string | null = null
    let gone = false
    void files
      .readBinary(path)
      .then((bytes) => {
        if (gone) return
        revoked = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mimeOf(path) }))
        setUrl(revoked)
      })
      .catch(() => {
        if (!gone) setMissing(true)
      })
    return () => {
      gone = true
      if (revoked !== null) URL.revokeObjectURL(revoked)
    }
  }, [path, files])

  return (
    <figure className="relative m-0 max-w-80">
      {url !== null && (
        <button
          type="button"
          aria-label={`Expand ${name}`}
          title="Expand"
          className="block cursor-zoom-in rounded border-0 bg-transparent p-0"
          onClick={() => setExpanded(true)}
        >
          <img src={url} alt={name} className="block h-52 w-auto max-w-full rounded object-contain" />
        </button>
      )}
      {missing && <p className="m-0 text-xs">{path} — file missing</p>}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title="Remove from the board — the file stays in assets/"
        className="absolute top-0 right-0 cursor-pointer rounded border-0 bg-black/50 px-1 text-white"
        onClick={onRemove}
      >
        ✕
      </button>
      {expanded && url !== null && <Lightbox url={url} name={name} onClose={() => setExpanded(false)} />}
    </figure>
  )
}

/**
 * The image at full size over a dark backdrop. Escape, the backdrop, and
 * the close button all dismiss it. The key listener runs in the capture
 * phase and stops the event there, so the app's own Escape handler — the
 * one that would close the scene editor behind us — never sees it.
 */
function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div className="lightbox-backdrop" onClick={onClose}>
      <figure role="dialog" aria-label={name} className="lightbox" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt={name} className="lightbox-image" />
        <figcaption className="lightbox-caption">{name}</figcaption>
        <button type="button" aria-label="Close" title="Close (Esc)" className="lightbox-close" onClick={onClose}>
          ✕
        </button>
      </figure>
    </div>,
    document.body,
  )
}
