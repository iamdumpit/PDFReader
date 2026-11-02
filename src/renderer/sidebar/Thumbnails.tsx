import { useEffect, useRef, useState } from 'react'
import { useDoc } from '../store/documentStore'

const THUMB_WIDTH = 140

function Thumb({ pageNum }: { pageNum: number }): React.JSX.Element {
  const doc = useDoc((s) => s.doc)!
  const size = useDoc((s) => s.pageSizes[pageNum - 1])
  const current = useDoc((s) => s.currentPage === pageNum)
  const goToPage = useDoc((s) => s.goToPage)
  const hostRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const height = (size.height / size.width) * THUMB_WIDTH

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: el.closest('.thumbs'),
      rootMargin: '200px 0px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void (async () => {
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const viewport = page.getViewport({ scale: (THUMB_WIDTH / size.width) * (window.devicePixelRatio || 1) })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const t = page.render({ canvas, viewport })
      task = t
      try {
        await t.promise
      } catch {
        /* cancelled */
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNum, size.width, visible])

  useEffect(() => {
    if (current) hostRef.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <button ref={hostRef} className={`thumb${current ? ' current' : ''}`} onClick={() => goToPage(pageNum)}>
      <canvas ref={canvasRef} style={{ width: THUMB_WIDTH, height }} />
      <span>{pageNum}</span>
    </button>
  )
}

export function Thumbnails(): React.JSX.Element {
  const count = useDoc((s) => s.pageSizes.length)
  const nightMode = useDoc((s) => s.nightMode)
  return (
    <div className={`thumbs${nightMode ? ' night' : ''}`}>
      {Array.from({ length: count }, (_, i) => (
        <Thumb key={i} pageNum={i + 1} />
      ))}
    </div>
  )
}
