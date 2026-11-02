import { useDoc } from '../store/documentStore'
import type { OutlineNode } from '../services/pdfDocument'

function Node({ node, depth }: { node: OutlineNode; depth: number }): React.JSX.Element {
  const goToPage = useDoc((s) => s.goToPage)
  return (
    <>
      <button
        className="row"
        style={{ paddingLeft: 8 + depth * 14 }}
        disabled={node.page === null}
        onClick={() => node.page !== null && goToPage(node.page)}
        title={node.page ? `Page ${node.page}` : undefined}
      >
        <span className="grow">{node.title}</span>
        {node.page !== null && <span className="muted">{node.page}</span>}
      </button>
      {node.items.map((c, i) => (
        <Node key={i} node={c} depth={depth + 1} />
      ))}
    </>
  )
}

export function Bookmarks(): React.JSX.Element {
  const outline = useDoc((s) => s.outline)
  const user = useDoc((s) => s.userBookmarks)
  const currentPage = useDoc((s) => s.currentPage)
  const goToPage = useDoc((s) => s.goToPage)
  const addBookmark = useDoc((s) => s.addBookmark)
  const removeBookmark = useDoc((s) => s.removeBookmark)

  return (
    <div className="panel">
      <div className="panelHead">
        <strong>My bookmarks</strong>
        <button onClick={() => addBookmark('')}>+ Page {currentPage}</button>
      </div>
      {user.length === 0 && <p className="muted pad">No bookmarks yet.</p>}
      {user.map((b) => (
        <div key={b.page} className="row">
          <button className="grow rowBtn" onClick={() => goToPage(b.page)}>
            {b.label}
          </button>
          <button className="icon" title="Remove" onClick={() => removeBookmark(b.page)}>
            ×
          </button>
        </div>
      ))}
      <div className="panelHead">
        <strong>Document outline</strong>
      </div>
      {outline.length === 0 && <p className="muted pad">This PDF has no outline.</p>}
      {outline.map((n, i) => (
        <Node key={i} node={n} depth={0} />
      ))}
    </div>
  )
}
