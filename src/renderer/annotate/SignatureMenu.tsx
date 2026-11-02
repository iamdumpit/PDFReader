import { useEffect, useRef, useState } from 'react'
import { useAnn } from '../store/annotationStore'
import { SignaturePad } from './SignaturePad'
import {
  importSignature,
  loadSignatures,
  saveSignatures,
  type Signature
} from '../services/signatures'

export function SignatureMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [sigs, setSigs] = useState<Signature[]>(loadSignatures)
  const [removeBg, setRemoveBg] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const setStamp = useAnn((s) => s.setStamp)
  const tool = useAnn((s) => s.tool)
  const stampImage = useAnn((s) => s.stampImage)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const update = (next: Signature[]): void => {
    setSigs(next)
    saveSignatures(next)
  }

  const add = async (file: File): Promise<void> => {
    setError(null)
    try {
      const sig = await importSignature(file, removeBg)
      update([...sigs, sig])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const saveDrawn = (sig: Signature): void => {
    update([...sigs, sig])
    setDrawing(false)
    place(sig) // ready to click onto the page straight away
  }

  const place = (s: Signature): void => {
    setStamp('', { dataUrl: s.dataUrl, width: s.width, height: s.height })
    setOpen(false)
  }

  return (
    <div className="sigMenu" ref={rootRef}>
      <button
        className={tool === 'stamp' && stampImage ? 'on' : ''}
        onClick={() => setOpen((o) => !o)}
        title="Sign with a saved signature image"
      >
        Sign ▾
      </button>
      {open && (
        <div className="sigPanel">
          <div className="sigHead">Click a signature, then click the page to place it.</div>
          {sigs.length === 0 && <p className="muted pad">No signatures yet.</p>}
          <div className="sigList">
            {sigs.map((s) => (
              <div key={s.id} className="sigItem">
                <button className="sigThumb" onClick={() => place(s)} title="Place this signature">
                  <img src={s.dataUrl} alt="signature" />
                </button>
                <button className="icon" title="Delete" onClick={() => update(sigs.filter((x) => x.id !== s.id))}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="sigOpt">
            <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
            Remove paper background
          </label>
          <button
            onClick={() => {
              setOpen(false)
              setDrawing(true)
            }}
          >
            ✎ Draw signature…
          </button>
          <button onClick={() => fileRef.current?.click()}>Add signature image…</button>
          {error && <p className="sigErr">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void add(f)
              e.target.value = ''
            }}
          />
        </div>
      )}
      {drawing && <SignaturePad onSave={saveDrawn} onClose={() => setDrawing(false)} />}
    </div>
  )
}
