import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from '../services/pdfDocument'

const WIDTH = 150

interface Props {
  doc: PDFDocumentProxy
  pageNum: number
  night: boolean
}

/** Lazily rendered page preview, sized to fit a fixed-width tile. */
export function PageThumb({ doc, pageNum, night }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [box, setBox] = useState<{ w: number; h: number }>({ w: WIDTH, h: WIDTH * 1.3 })

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: el.closest('.pageGrid'),
      rootMargin: '300px 0px'
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
      const base = page.getViewport({ scale: 1 })
      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: (WIDTH / base.width) * dpr })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      setBox({ w: WIDTH, h: (base.height / base.width) * WIDTH })
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
  }, [doc, pageNum, visible])

  return (
    <div ref={hostRef} className={`pageThumb${night ? ' night' : ''}`} style={{ width: box.w, height: box.h }}>
      <canvas ref={canvasRef} style={{ width: box.w, height: box.h }} />
    </div>
  )
}
