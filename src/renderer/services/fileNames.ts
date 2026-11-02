const SUFFIX = '_Protected'

/** "report.pdf" -> "report_Protected.pdf"; already-suffixed names are returned unchanged. */
export function protectedName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '') || 'document'
  return /_Protected$/i.test(base) ? `${base}.pdf` : `${base}${SUFFIX}.pdf`
}

/** Same folder as `path`, new file name. Works with both / and \ separators. */
export function withFileName(path: string, fileName: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i < 0 ? fileName : path.slice(0, i + 1) + fileName
}
