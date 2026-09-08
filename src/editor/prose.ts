import type { Editor } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { MentionHighlights } from './mentions'

/**
 * The prose editor's extension set. Prose lives in the file as Markdown
 * under `## Prose`, so the editor speaks Markdown both ways. Headings
 * stop at level 3: a `## ` line would open a new file section, and a
 * `# ` line is the scene title's. Mentions are drawn over the text by
 * the last extension and never enter it.
 */
export function proseExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [3, 4, 5, 6] },
      link: false,
      underline: false,
    }),
    Markdown,
    Placeholder.configure({ placeholder: 'Prose lives here — dialogue included. Nothing yet.' }),
    MentionHighlights,
  ]
}

/**
 * The prose as the file should hold it: Markdown, trimmed like the
 * section it came from. Pasted text can still arrive as a `#` or `##`
 * heading the schema never offers; those are lowered to `###` rather
 * than let into the file, where they would split the scene's sections.
 */
export function readProse(editor: Editor): string {
  return editor
    .getMarkdown()
    .replace(/^#{1,2} /gm, '### ')
    .trim()
}
