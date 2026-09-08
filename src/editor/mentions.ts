import { Extension } from '@tiptap/core'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Span } from '../mentions/match'
import { targetKey } from '../mentions/verdicts'

/**
 * Mentions drawn over the prose. The extension owns no knowledge of the
 * story: the host hands it a `find` over plain text, and on every change
 * to the document (or to `find`) it walks each text block, runs the
 * finder on the block's text, and lays inline decorations over the
 * spans. Decorations never enter the document, so what the editor
 * reports outward is exactly what the writer typed.
 */

export type MentionFinder = (text: string) => Span[]

export interface MentionStorage {
  find: MentionFinder | null
}

declare module '@tiptap/core' {
  interface Storage {
    mentionHighlights: MentionStorage
  }
}

export const mentionsKey = new PluginKey<DecorationSet>('mentions')

export const MentionHighlights = Extension.create<Record<string, never>, MentionStorage>({
  name: 'mentionHighlights',

  addStorage() {
    return { find: null }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    const build = (doc: ProseNode) => DecorationSet.create(doc, storage.find ? decorate(doc, storage.find) : [])
    return [
      new Plugin({
        key: mentionsKey,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(mentionsKey) ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => mentionsKey.getState(state),
        },
      }),
    ]
  },
})

/** A text block's text with the ProseMirror position of each character run, so a span maps back. */
interface Segment {
  textStart: number
  textEnd: number
  pos: number
}

function decorate(doc: ProseNode, find: MentionFinder): Decoration[] {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const segments: Segment[] = []
    node.forEach((child, offset) => {
      // A non-text inline (a hard break) is one position wide; a newline
      // keeps the text and the positions in step.
      const piece = child.isText ? (child.text ?? '') : '\n'
      segments.push({ textStart: text.length, textEnd: text.length + piece.length, pos: pos + 1 + offset })
      text += piece
    })
    if (text.trim() === '') return false
    const at = (offset: number) => {
      const segment = segments.find((s) => offset >= s.textStart && offset < s.textEnd) ?? segments[segments.length - 1]
      return segment.pos + (offset - segment.textStart)
    }
    for (const span of find(text)) {
      const from = at(span.from)
      const to = at(span.to - 1) + 1
      decorations.push(
        Decoration.inline(from, to, {
          class: `mention mention-${span.certainty}`,
          'data-targets': span.targets.map(targetKey).join('|'),
          'data-quote': span.quote,
          'data-certainty': span.certainty,
          'data-from': String(from),
          'data-to': String(to),
        }),
      )
    }
    return false
  })
  return decorations
}
