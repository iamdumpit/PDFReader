import { useDoc } from '../store/documentStore'

export function SearchResults(): React.JSX.Element {
  const { hits, activeHit, searching, query } = useDoc()
  const jump = (i: number): void => {
    useDoc.setState({ activeHit: i })
    useDoc.getState().goToPage(hits[i].page)
  }
  return (
    <div className="panel">
      <div className="panelHead">
        <strong>{searching ? 'Searching…' : query ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : 'Search'}</strong>
      </div>
      {!query && <p className="muted pad">Type in the search box above (Ctrl+F).</p>}
      {hits.slice(0, 500).map((h, i) => (
        <button key={i} className={`row${i === activeHit ? ' active' : ''}`} onClick={() => jump(i)}>
          <span className="grow snippet">…{h.snippet}…</span>
          <span className="muted">p.{h.page}</span>
        </button>
      ))}
      {hits.length > 500 && <p className="muted pad">Showing first 500 results.</p>}
    </div>
  )
}
