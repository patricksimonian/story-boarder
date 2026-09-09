/** An <img> only renders an SVG blob when the MIME says so; the rest are happy either way. */
export function mimeOf(path: string): string {
  const ext = path.split('.').at(-1)?.toLowerCase()
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return `image/${ext ?? 'png'}`
}
