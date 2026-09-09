import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { TargetKey } from '../domain/types'
import { proseExtensions, readProse } from '../editor/prose'
import { KIND_LABEL, type MentionCard, type MentionContext } from '../mentions/context'
import { pageParagraphs } from '../mentions/describe'
import type { Certainty } from '../mentions/match'
import { targetKey } from '../mentions/verdicts'

/**
 * The prose field: TipTap over Markdown. Mount it with a key that changes
 * whenever the prose is replaced from outside (another scene, a disk
 * follow, a resolved conflict) — while the writer types, the editor owns
 * its own document and only reports Markdown outward. With a mention
 * context it also draws what the text names and answers for it: hover
 * or click opens the card, Ctrl+click goes straight to the page.
 */
export function ProseEditor({
  markdown,
  onChange,
  mentions,
}: {
  markdown: string
  onChange: (markdown: string) => void
  mentions?: MentionContext
}) {
  const editor = useEditor({
    extensions: proseExtensions(),
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'prose', 'aria-label': 'Prose', role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor }) => onChange(readProse(editor)),
  })

  // The finder changes when the story does (a new page, a verdict); the
  // editor keeps its document and redraws over it.
  const find = mentions?.find ?? null
  useEffect(() => {
    editor?.commands.setMentionFinder(find)
  }, [editor, find])

  const wrap = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const cancelClose = () => clearTimeout(closeTimer.current)
  const closeSoon = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setTip((t) => (t?.pinned ? t : null)), 300)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const tipFrom = (el: HTMLElement, pinned: boolean): Tip | null => {
    const targets = (el.dataset.targets ?? '').split('|').filter(Boolean)
    if (targets.length === 0 && el.dataset.certainty !== 'unknown') return null
    const rect = el.getBoundingClientRect()
    const box = wrap.current?.getBoundingClientRect()
    return {
      quote: el.dataset.quote ?? el.textContent ?? '',
      targets,
      certainty: (el.dataset.certainty as Certainty) ?? 'certain',
      from: Number(el.dataset.from),
      to: Number(el.dataset.to),
      top: rect.bottom - (box?.top ?? 0) + 4,
      left: rect.left - (box?.left ?? 0),
      pinned,
    }
  }

  const mentionAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.('.mention') as HTMLElement | null
  const inTip = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('.mention-tip')

  return (
    <div
      ref={wrap}
      className="prose-wrap"
      onMouseOver={(e) => {
        if (!mentions) return
        if (inTip(e.target)) {
          cancelClose()
          return
        }
        const el = mentionAt(e.target)
        if (!el) return
        cancelClose()
        setTip((current) => (current?.pinned ? current : tipFrom(el, false)))
      }}
      onMouseOut={(e) => {
        if (mentions && (mentionAt(e.target) || inTip(e.target))) closeSoon()
      }}
      onMouseDown={(e) => {
        if (!mentions || inTip(e.target)) return
        const el = mentionAt(e.target)
        cancelClose()
        if (el && (e.ctrlKey || e.metaKey)) {
          // A mention is a link: Ctrl+click follows it, the way links in an editor do.
          const targets = (el.dataset.targets ?? '').split('|').filter(Boolean)
          if (targets.length === 1) {
            e.preventDefault()
            setTip(null)
            mentions.onOpen(targets[0])
            return
          }
        }
        setTip(el ? tipFrom(el, true) : null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && tip) {
          e.stopPropagation()
          setTip(null)
        }
      }}
    >
      <EditorContent editor={editor} />
      {mentions && tip && editor && (
        <MentionTip
          tip={tip}
          mentions={mentions}
          onPin={() => setTip((t) => (t ? { ...t, pinned: true } : t))}
          onClose={() => setTip(null)}
          onFix={(text) => {
            editor.chain().focus().insertContentAt({ from: tip.from, to: tip.to }, text).run()
            setTip(null)
          }}
        />
      )}
    </div>
  )
}

interface Tip {
  quote: string
  targets: TargetKey[]
  certainty: Certainty
  from: number
  to: number
  top: number
  left: number
  /** Opened by a click: stays until dismissed rather than following the mouse away. */
  pinned: boolean
}

/** The possessive the writer typed survives a corrected spelling. */
function corrected(quote: string, title: string): string {
  const possessive = quote.match(/['’]s?$/)
  return possessive ? `${title}${possessive[0]}` : title
}

const emptyCard = (key: TargetKey): MentionCard => ({
  key,
  kind: 'note',
  title: key,
  lines: [],
  others: [],
  othersCount: 0,
  body: '',
  tags: [],
  aliases: [],
  developments: [],
  namedIn: [],
  images: [],
})

/** A picture from the page's mood board, read from the story folder once the card shows it. */
function CardImage({ path, load, large }: { path: string; load?: (path: string) => Promise<string | null>; large: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    let made: string | null = null
    if (load) {
      void load(path).then((next) => {
        if (!live) {
          if (next) URL.revokeObjectURL(next)
          return
        }
        made = next
        setUrl(next)
      })
    }
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [path, load])
  if (!url) return null
  const name = path.split('/').at(-1) ?? path
  return <img className={`mention-image ${large ? 'large' : ''}`} src={url} alt={name} title={name} />
}

function MentionTip({
  tip,
  mentions,
  onPin,
  onClose,
  onFix,
}: {
  tip: Tip
  mentions: MentionContext
  onPin: () => void
  onClose: () => void
  onFix: (text: string) => void
}) {
  const [expanded, setExpanded] = useState<TargetKey | null>(null)
  const cards = tip.targets.map((key) => mentions.describe(key) ?? emptyCard(key))
  const verdict = (entity: TargetKey | null) => {
    mentions.onVerdict(tip.quote, entity)
    onClose()
  }
  const one = cards.length === 1 ? cards[0] : undefined
  if (tip.certainty === 'unknown') {
    const name = tip.quote.replace(/['’]s?$/, '')
    const suggested = mentions.suggestedKind?.(tip.quote)
    const kinds: { kind: 'character' | 'place' | 'lore' | 'scene' | 'note'; label: string }[] = [
      { kind: 'character', label: 'character' },
      { kind: 'place', label: 'place' },
      { kind: 'lore', label: 'lore page' },
      { kind: 'scene', label: 'scene' },
      { kind: 'note', label: 'note' },
    ]
    const ordered = [...kinds].sort((a, b) => (a.kind === suggested ? -1 : b.kind === suggested ? 1 : 0))
    return (
      <div className="mention-tip mention-tip-unknown" role="dialog" aria-label={`Mention: ${tip.quote}`} style={{ top: tip.top, left: tip.left }}>
        <p className="mention-ask">
          <strong>{name}</strong> is mentioned, but nothing in the story describes it.{suggested ? ` Suggested: a ${suggested === 'lore' ? 'lore page' : suggested}.` : ''}
        </p>
        <div className="mention-actions">
          {ordered.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              className={kind === suggested ? 'suggested' : ''}
              onClick={() => {
                mentions.onCreate?.(kind, name)
                onClose()
              }}
            >
              Create {label}
            </button>
          ))}
          <button type="button" onClick={() => verdict(null)}>
            Not a thing
          </button>
        </div>
      </div>
    )
  }
  return (
    <div
      className={`mention-tip ${expanded ? 'expanded' : ''}`}
      role="dialog"
      aria-label={`Mention: ${tip.quote}`}
      style={{ top: tip.top, left: tip.left }}
    >
      {tip.certainty === 'probable' && one && <p className="mention-ask">Did you mean {one.title}?</p>}
      {tip.certainty === 'model' && <p className="mention-ask">Read as a mention — confirm it, or say it isn’t one.</p>}
      {cards.map((card) => (
        <div key={card.key} className="mention-card">
          <div className="mention-head">
            <span className="mention-kind">{KIND_LABEL[card.kind]}</span>
            <button
              type="button"
              className="goto mention-link"
              aria-label={`Open ${KIND_LABEL[card.kind].toLowerCase()} ${card.title}`}
              title="Go to the page (Ctrl+click on the mention does the same)"
              onClick={() => mentions.onOpen(card.key)}
            >
              {card.title} ↗
            </button>
            <button
              type="button"
              className="mention-expand"
              aria-expanded={expanded === card.key}
              aria-label={`${expanded === card.key ? 'Collapse' : 'Expand'} ${card.title}`}
              onClick={() => {
                onPin()
                setExpanded(expanded === card.key ? null : card.key)
              }}
            >
              {expanded === card.key ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {expanded === card.key ? (
            <ExpandedCard card={card} onOpen={mentions.onOpen} imageUrl={mentions.imageUrl} />
          ) : (
            <>
              {card.images.length > 0 && (
                <div className="mention-images">
                  {card.images.slice(0, 3).map((path) => (
                    <CardImage key={path} path={path} load={mentions.imageUrl} large={false} />
                  ))}
                </div>
              )}
              {card.lines.map((line, i) => (
                <p key={i} className="mention-line">
                  {line}
                </p>
              ))}
              {card.othersCount > 0 && (
                <p className="mention-others">
                  Also named in {card.others.join(', ')}
                  {card.othersCount > card.others.length ? ` and ${card.othersCount - card.others.length} more` : ''}
                </p>
              )}
            </>
          )}
        </div>
      ))}
      <div className="mention-actions">
        {tip.certainty === 'probable' && one && (
          <>
            <button type="button" onClick={() => onFix(corrected(tip.quote, one.title))}>
              Fix spelling
            </button>
            <button type="button" onClick={() => verdict(one.key)}>
              It is {one.title}
            </button>
          </>
        )}
        {tip.certainty === 'model' && one && (
          <button type="button" onClick={() => verdict(one.key)}>
            Confirm {one.title}
          </button>
        )}
        {cards.length > 1 &&
          cards.map((card) => (
            <button key={card.key} type="button" onClick={() => verdict(card.key)}>
              It is the {KIND_LABEL[card.kind].toLowerCase()}
            </button>
          ))}
        <button type="button" onClick={() => verdict(null)}>
          Not a mention
        </button>
      </div>
    </div>
  )
}

/** The whole page inside the card: its text, its tags and aliases, everything recorded about it, everywhere it is named. */
function ExpandedCard({
  card,
  onOpen,
  imageUrl,
}: {
  card: MentionCard
  onOpen: (key: TargetKey) => void
  imageUrl?: (path: string) => Promise<string | null>
}) {
  const paragraphs = pageParagraphs(card.body)
  return (
    <div className="mention-page" aria-label={`${card.title}, in full`}>
      {card.images.length > 0 && (
        <div className="mention-images">
          {card.images.map((path) => (
            <CardImage key={path} path={path} load={imageUrl} large />
          ))}
        </div>
      )}
      {paragraphs.length === 0 ? <p className="mention-line mention-empty">The page is empty.</p> : paragraphs.map((p, i) => <p key={i} className="mention-line">{p}</p>)}
      {(card.tags.length > 0 || card.aliases.length > 0) && (
        <p className="mention-others">
          {card.tags.length > 0 && <span>Tags: {card.tags.join(', ')}. </span>}
          {card.aliases.length > 0 && <span>Also called {card.aliases.join(', ')}.</span>}
        </p>
      )}
      {card.developments.length > 0 && (
        <div className="mention-section">
          <h5>Developments</h5>
          <ul className="mention-list">
            {card.developments.map((d, i) => (
              <li key={i}>
                <span title={d.quote}>{d.fact}</span>{' '}
                <button type="button" className="goto" aria-label={`Open ${d.item.kind} ${d.item.title}`} onClick={() => onOpen(targetKey(d.item))}>
                  {d.item.title} ↗
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.namedIn.length > 0 && (
        <div className="mention-section">
          <h5>Named in</h5>
          <ul className="mention-list">
            {card.namedIn.map((item) => (
              <li key={targetKey(item)}>
                <button type="button" className="goto" aria-label={`Open ${item.kind} ${item.title}`} onClick={() => onOpen(targetKey(item))}>
                  {item.title} ↗
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
