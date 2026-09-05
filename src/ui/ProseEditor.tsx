import { EditorContent, useEditor } from '@tiptap/react'
import { proseExtensions, readProse } from '../editor/prose'

/**
 * The prose field: TipTap over Markdown. Mount it with a key that changes
 * whenever the prose is replaced from outside (another scene, a disk
 * follow, a resolved conflict) — while the writer types, the editor owns
 * its own document and only reports Markdown outward.
 */
export function ProseEditor({ markdown, onChange }: { markdown: string; onChange: (markdown: string) => void }) {
  const editor = useEditor({
    extensions: proseExtensions(),
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'prose', 'aria-label': 'Prose', role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor }) => onChange(readProse(editor)),
  })
  return <EditorContent editor={editor} />
}
