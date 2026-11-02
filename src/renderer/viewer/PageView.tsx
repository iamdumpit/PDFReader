import { memo, useEffect, useRef, useState } from 'react'
import { AnnotationLayer as PdfAnnotationLayer, AnnotationMode, TextLayer } from 'pdfjs-dist'
import { SimpleLinkService } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { PDFDocumentProxy } from '../services/pdfDocument'
import { useDoc } from '../store/documentStore'
import { AnnotationLayer } from '../annotate/AnnotationLayer'

interface Props {
  doc: PDFDocumentProxy
  pageNum: number
  scale: number
  width: number
  height: number
}

function PageViewImpl({ doc, pageNum, scale, width, height }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const textDivsRef = useRef<HTMLElement[]>([])
  const [near, setNear] = useState(false)
  const [rendered, setRendered] = useState(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: el.closest('.viewer'),
      rootMargin: '150% 0px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const textHost = textRef.current
    const formHost = formRef.current
    if (!canvas || !textHost || !formHost) return
    if (!near) {
      canvas.width = canvas.height = 0
      textHost.replaceChildren()
      formHost.replaceChildren()
      textDivsRef.current = []
      setRendered(0)
      return
    }

    let cancelled = false
    let task: { cancel: () => void } | null = null
    let textLayer: TextLayer | null = null

    void (async () => {
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      // checkbox/radio on/off glyphs are drawn here and picked up by the form layer
      const annotationCanvasMap = new Map<string, HTMLCanvasElement>()
      const renderTask = page.render({
        canvas,
        viewport,
        annotationMode: AnnotationMode.ENABLE_FORMS,
        annotationCanvasMap,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      })
      task = renderTask
      try {
        await renderTask.promise
      } catch {
        return // cancelled
      }
      if (cancelled) return

      textHost.replaceChildren()
      textHost.style.setProperty('--total-scale-factor', String(scale))
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textHost,
        viewport
      })
      await textLayer.render()
      if (cancelled) return
      textDivsRef.current = textLayer.textDivs

      // fillable form fields (pdf.js keeps the entered values in doc.annotationStorage)
      const widgets = (await page.getAnnotations({ intent: 'display' })).filter((a) => a.subtype === 'Widget')
      formHost.replaceChildren()
      if (widgets.length && !cancelled) {
        formHost.style.setProperty('--total-scale-factor', String(scale))
        const linkService = new SimpleLinkService()
        const layer = new PdfAnnotationLayer({
          div: formHost,
          accessibilityManager: null,
          annotationCanvasMap,
          annotationEditorUIManager: null,
          page,
          viewport,
          structTreeLayer: null,
          commentManager: null,
          linkService,
          annotationStorage: doc.annotationStorage
        })
        await layer.render({
          annotations: widgets,
          div: formHost,
          viewport: viewport.clone({ dontFlip: true }),
          page,
          linkService,
          annotationStorage: doc.annotationStorage,
          renderForms: true,
          imageResourcesPath: '',
          enableScripting: false,
          hasJSActions: false,
          fieldObjects: null,
          annotationCanvasMap
        })
      }
      if (!cancelled) setRendered((n) => n + 1)
    })()

    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
  }, [doc, pageNum, scale, near])

  // Highlight search hits once the text layer exists.
  const query = useDoc((s) => s.query)
  const hits = useDoc((s) => s.hits)
  const activeHit = useDoc((s) => s.activeHit)
  const scrolledFor = useRef('')
  useEffect(() => {
    const divs = textDivsRef.current
    if (!rendered) return
    // undo earlier highlighting
    for (const d of divs) {
      if (d.dataset.orig !== undefined) {
        d.textContent = d.dataset.orig
        delete d.dataset.orig
      }
    }
    if (!query.trim()) return

    // collect ranges per span
    const byItem = new Map<number, { from: number; to: number; i: number }[]>()
    hits.forEach((h, i) => {
      if (h.page !== pageNum) return
      for (const g of h.segs) {
        const list = byItem.get(g.item) ?? []
        list.push({ from: g.from, to: g.to, i })
        byItem.set(g.item, list)
      }
    })
    byItem.forEach((list, item) => {
      const div = divs[item]
      if (!div) return
      const text = div.textContent ?? ''
      div.dataset.orig = text
      list.sort((x, y) => x.from - y.from)
      const frag = document.createDocumentFragment()
      let pos = 0
      for (const r of list) {
        if (r.from < pos) continue
        frag.append(text.slice(pos, r.from))
        const mark = document.createElement('mark')
        mark.className = r.i === activeHit ? 'hit active' : 'hit'
        mark.textContent = text.slice(r.from, r.to)
        frag.append(mark)
        pos = r.to
      }
      frag.append(text.slice(pos))
      div.replaceChildren(frag)
    })

    // bring the current match into view (once per navigation, not on every re-render/zoom)
    const key = `${query}|${hits.length}|${activeHit}`
    const active = hostRef.current?.querySelector<HTMLElement>('mark.hit.active')
    if (active && scrolledFor.current !== key) {
      scrolledFor.current = key
      active.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  }, [rendered, query, hits, activeHit, pageNum])

  return (
    <div
      ref={hostRef}
      className="page"
      data-page={pageNum}
      style={{ width: width * scale, height: height * scale }}
    >
      <canvas ref={canvasRef} style={{ width: width * scale, height: height * scale }} />
      <div ref={textRef} className="textLayer" />
      <div ref={formRef} className="annotationLayer formLayer" />
      <AnnotationLayer pageNum={pageNum} scale={scale} width={width} height={height} />
    </div>
  )
}

export const PageView = memo(PageViewImpl)
