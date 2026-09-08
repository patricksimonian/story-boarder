import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { TargetKey } from '../domain/types'
import { mentionsKey } from '../editor/mentions'
import { proseExtensions, readProse } from '../editor/prose'
import { KIND_LABEL, type MentionContext } from '../mentions/context'
import type { Certainty } from '../mentions/match'

/**
 * The prose field: TipTap over Markdown. Mount it with a key that changes
 * whenever the prose is replaced from outside (another scene, a disk
 * follow, a resolved conflict) — while the writer types, the editor owns
 * its own document and only reports Markdown outward. With a mention
 * context it also draws what the text names and answers for it on hover.
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
    if (!editor) return
    editor.storage.mentionHighlights.find = find
    editor.view.dispatch(editor.state.tr.setMeta(mentionsKey, true))
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
    if (targets.length === 0) return null
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

function MentionTip({
  tip,
  mentions,
  onClose,
  onFix,
}: {
  tip: Tip
  mentions: MentionContext
  onClose: () => void
  onFix: (text: string) => void
}) {
  const cards = tip.targets.map((key) => mentions.describe(key) ?? { key, kind: 'note' as const, title: key, lines: [], others: [], othersCount: 0 })
  const verdict = (entity: TargetKey | null) => {
    mentions.onVerdict(tip.quote, entity)
    onClose()
  }
  const one = cards.length === 1 ? cards[0] : undefined
  return (
    <div className="mention-tip" role="dialog" aria-label={`Mention: ${tip.quote}`} style={{ top: tip.top, left: tip.left }}>
      {tip.certainty === 'probable' && one && <p className="mention-ask">Did you mean {one.title}?</p>}
      {tip.certainty === 'model' && <p className="mention-ask">Read as a mention — confirm it, or say it isn’t one.</p>}
      {cards.map((card) => (
        <div key={card.key} className="mention-card">
          <div className="mention-head">
            <span className="mention-kind">{KIND_LABEL[card.kind]}</span>
            <button type="button" className="goto" aria-label={`Open ${KIND_LABEL[card.kind].toLowerCase()} ${card.title}`} onClick={() => mentions.onOpen(card.key)}>
              {card.title} ↗
            </button>
          </div>
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
