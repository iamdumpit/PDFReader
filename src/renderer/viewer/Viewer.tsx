import { useEffect, useRef } from 'react'
import { useDoc } from '../store/documentStore'
import { PageView } from './PageView'
import { useAnn } from '../store/annotationStore'
import { markupFromSelection, selectMarkupAt } from '../annotate/selection'

export function Viewer(): React.JSX.Element {
  const doc = useDoc((s) => s.doc)
  const sizes = useDoc((s) => s.pageSizes)
  const scale = useDoc((s) => s.scale)
  const navRequest = useDoc((s) => s.navRequest)
  const nightMode = useDoc((s) => s.nightMode)
  const ref = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  // Jump to requested page.
  useEffect(() => {
    if (!navRequest || !ref.current) return
    const el = ref.current.querySelector<HTMLElement>(`[data-page="${navRequest.page}"]`)
    if (el) ref.current.scrollTop = el.offsetTop - 12
  }, [navRequest])

  // Keep the same page in view when zoom changes.
  const prevScale = useRef(scale)
  useEffect(() => {
    const c = ref.current
    if (c && prevScale.current !== scale) {
      c.scrollTop = (c.scrollTop * scale) / prevScale.current
    }
    prevScale.current = scale
  }, [scale])

  // Track current page on scroll; ctrl+wheel zooms.
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let raf = 0
    const onScroll = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const probe = c.scrollTop + c.clientHeight * 0.35
        let current = 1
        for (const el of Array.from(c.querySelectorAll<HTMLElement>('.page'))) {
          if (el.offsetTop <= probe) current = Number(el.dataset.page)
          else break
        }
        useDoc.getState().setCurrentPage(current)
      })
    }
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const s = useDoc.getState()
      s.setScale(s.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    const onMouseUp = (e: MouseEvent): void => {
      const tool = useAnn.getState().tool
      if (tool === 'text' && window.getSelection()?.isCollapsed) selectMarkupAt(e)
      if (tool === 'highlight' || tool === 'underline') {
        // wait a tick so the browser finalizes the selection
        setTimeout(() => markupFromSelection(tool, scaleRef.current), 0)
      }
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (!(e.target as Element).closest('.annShape, .annHandle, .noteEditor, .ftEditor, .annActions')) useAnn.getState().select(null)
    }
    c.addEventListener('mouseup', onMouseUp)
    c.addEventListener('pointerdown', onPointerDown)
    c.addEventListener('scroll', onScroll, { passive: true })
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cancelAnimationFrame(raf)
      c.removeEventListener('mouseup', onMouseUp)
      c.removeEventListener('pointerdown', onPointerDown)
      c.removeEventListener('scroll', onScroll)
      c.removeEventListener('wheel', onWheel)
    }
  }, [doc])

  return (
    <div ref={ref} className={`viewer${nightMode ? ' night' : ''}`}>
      {doc ? (
        <div className="pages" style={{ minWidth: Math.max(...sizes.map((s) => s.width)) * scale + 48 }}>
          {sizes.map((size, i) => (
            <PageView
              key={`${doc.fingerprints[0]}-${i}`}
              doc={doc}
              pageNum={i + 1}
              scale={scale}
              width={size.width}
              height={size.height}
            />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>Open a PDF to get started</h2>
          <p>Use the Open button, press Ctrl+O, or drag a PDF here.</p>
        </div>
      )}
    </div>
  )
}
