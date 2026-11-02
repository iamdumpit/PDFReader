import { useEffect, useState } from 'react'
import { useDoc } from '../store/documentStore'
import { useUi } from '../store/uiStore'
import { Modal } from './Modal'
import { LEVELS, compressPdf, type CompressLevel } from '../services/pdfImages'
import { ALL_PERMISSIONS, type Permissions } from '../services/pdfSecurity'
import { hasAnyMetadata, readMetadata, stripMetadata, type MetadataInfo } from '../services/pdfMetadata'

const size = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/* ---------------------------------------------------------------- compress */

export function CompressDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeDialog)
  const doc = useDoc((s) => s.doc)
  const [level, setLevel] = useState<CompressLevel>('medium')
  const [current, setCurrent] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ before: number; after: number; images: number; applied: boolean } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const history = useDoc((s) => s.history)

  useEffect(() => {
    if (doc) void useDoc.getState().bake().then((b) => setCurrent(b.length))
  }, [doc])

  const run = async (): Promise<void> => {
    setConfirming(false)
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const before = await useDoc.getState().bake()
      const { bytes, imagesShrunk } = await compressPdf(before, level)
      if (bytes.length >= before.length) {
        setResult({ before: before.length, after: before.length, images: 0, applied: false })
      } else {
        const ok = await useDoc.getState().applyEdit(async () => bytes)
        setResult({ before: before.length, after: bytes.length, images: imagesShrunk, applied: ok })
        setCurrent(bytes.length)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <Modal title="Compress PDF">
      {!doc ? (
        <p className="pad">Open a PDF first.</p>
      ) : (
        <>
          <p className="muted">Current size: {current === null ? '…' : size(current)}</p>
          {(Object.keys(LEVELS) as CompressLevel[]).map((k) => (
            <label key={k} className="radioRow">
              <input type="radio" checked={level === k} onChange={() => setLevel(k)} />
              <span>
                <strong>{LEVELS[k].label}</strong> <span className="muted">— {LEVELS[k].hint}</span>
              </span>
            </label>
          ))}
          {result && (
            <p className={result.applied ? 'okMsg' : 'muted'}>
              {result.applied
                ? `Reduced from ${size(result.before)} to ${size(result.after)} (−${Math.round((1 - result.after / result.before) * 100)}%)${
                    result.images ? ` · ${result.images} image${result.images === 1 ? '' : 's'} downscaled` : ''
                  }. Save to keep it.`
                : 'This file is already well compressed — nothing changed.'}
            </p>
          )}
          {err && <p className="err">{err}</p>}
          {confirming && (
            <div className="confirmBox" role="alert">
              <strong>Compress “{useDoc.getState().fileName}”?</strong>
              <p>
                Photos will be re-saved at lower quality ({LEVELS[level].label}) and this can’t be reversed once you
                save. You can undo until then. Nothing is written to disk until you save.
              </p>
              <div className="modalActions">
                <span className="grow" />
                <button onClick={() => setConfirming(false)}>Cancel</button>
                <button className="primary" onClick={() => void run()}>
                  Yes, compress
                </button>
              </div>
            </div>
          )}
          <div className="modalActions">
            {result?.applied && history.length > 0 && (
              <button
                onClick={() => {
                  void useDoc.getState().undoEdit()
                  setResult(null)
                }}
              >
                Undo
              </button>
            )}
            <span className="grow" />
            <button onClick={close}>Close</button>
            <button className="primary" disabled={busy || confirming} onClick={() => setConfirming(true)}>
              {busy ? 'Compressing…' : 'Compress'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ----------------------------------------------------------------- protect */

export function ProtectDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeDialog)
  const doc = useDoc((s) => s.doc)
  const protection = useDoc((s) => s.protection)
  const [user, setUser] = useState('')
  const [confirm, setConfirm] = useState('')
  const [owner, setOwner] = useState('')
  const [perms, setPerms] = useState<Permissions>(ALL_PERMISSIONS)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const apply = (): void => {
    if (!user) return setMsg({ text: 'Enter a password to open the file.', ok: false })
    if (user !== confirm) return setMsg({ text: 'The passwords do not match.', ok: false })
    if (/[,=]/.test(user + owner)) return setMsg({ text: 'Passwords cannot contain "," or "=".', ok: false })
    useDoc.getState().setProtection({ userPassword: user, ownerPassword: owner, permissions: perms })
    setMsg({ text: 'Password protection is on. When you save (Ctrl+S) the file is written as “…_Protected.pdf”.', ok: true })
    setUser('')
    setConfirm('')
  }

  const remove = (): void => {
    useDoc.getState().setProtection(null)
    setMsg({ text: 'Protection removed. Save to write an unprotected copy.', ok: true })
  }

  const perm = (k: keyof Permissions, label: string): React.JSX.Element => (
    <label className="radioRow">
      <input type="checkbox" checked={perms[k]} onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })} />
      {label}
    </label>
  )

  return (
    <Modal title="Password protect">
      {!doc ? (
        <p className="pad">Open a PDF first.</p>
      ) : (
        <>
          <p className="muted">
            {protection ? 'This document will be saved with a password.' : 'Encrypts the file with AES-256 when you save it.'}
          </p>
          <label className="field">
            Password to open
            <input type="password" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
          </label>
          <label className="field">
            Confirm password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <label className="field">
            Owner password <span className="muted">(optional — needed to change the limits below)</span>
            <input type="password" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <div className="muted">Allow readers to:</div>
          <div className="permGrid">
            {perm('print', 'Print')}
            {perm('copy', 'Copy text')}
            {perm('edit', 'Edit / reorder pages')}
            {perm('annotate', 'Comment & fill forms')}
          </div>
          {msg && <p className={msg.ok ? 'okMsg' : 'err'}>{msg.text}</p>}
          <div className="modalActions">
            {protection && <button onClick={remove}>Remove protection</button>}
            <span className="grow" />
            <button onClick={close}>Close</button>
            <button className="primary" onClick={apply}>
              {protection ? 'Change password' : 'Protect'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- metadata */

export function MetadataDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeDialog)
  const doc = useDoc((s) => s.doc)
  const [info, setInfo] = useState<MetadataInfo | null>(null)
  const [authors, setAuthors] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async (): Promise<void> => setInfo(await readMetadata(await useDoc.getState().bake()))
  useEffect(() => {
    if (doc) void refresh()
  }, [doc])

  const rows: [string, string | undefined][] = info
    ? [
        ['Title', info.title],
        ['Author', info.author],
        ['Subject', info.subject],
        ['Keywords', info.keywords],
        ['Created by', info.creator],
        ['PDF producer', info.producer],
        ['Created', info.created],
        ['Modified', info.modified],
        ['Other fields', info.custom.length ? info.custom.join(', ') : undefined],
        ['XMP metadata', info.hasXmp ? 'present' : undefined],
        ['Annotation authors/dates', info.annotationAuthors ? `${info.annotationAuthors} annotation(s)` : undefined]
      ]
    : []

  const run = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    const ok = await useDoc.getState().applyEdit((b) => stripMetadata(b, { annotationAuthors: authors }))
    if (ok) {
      setDone(true)
      await refresh()
    } else setErr(useDoc.getState().error ?? 'Could not remove metadata.')
    setBusy(false)
  }

  const clean = info ? !hasAnyMetadata(info) && (!authors || info.annotationAuthors === 0) : false

  return (
    <Modal title="Remove metadata">
      {!doc ? (
        <p className="pad">Open a PDF first.</p>
      ) : !info ? (
        <p className="muted">Reading…</p>
      ) : (
        <>
          <p className="muted">Hidden details stored in this file:</p>
          <table className="metaTable">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className={v ? '' : 'muted'}>{v ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="radioRow">
            <input type="checkbox" checked={authors} onChange={(e) => setAuthors(e.target.checked)} />
            Also remove author names and dates from comments and annotations
          </label>
          {done && clean && <p className="okMsg">Metadata removed. Save to keep it.</p>}
          {!done && clean && <p className="muted">Nothing to remove.</p>}
          {err && <p className="err">{err}</p>}
          <div className="modalActions">
            <span className="grow" />
            <button onClick={close}>Close</button>
            <button className="primary" disabled={busy || clean} onClick={() => void run()}>
              {busy ? 'Working…' : 'Remove metadata'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------- open password */

export function PasswordDialog(): React.JSX.Element | null {
  const prompt = useUi((s) => s.passwordPrompt)
  const answer = useUi((s) => s.answerPassword)
  const [pw, setPw] = useState('')
  useEffect(() => setPw(''), [prompt])
  if (!prompt) return null
  return (
    <Modal title="Password required" onClose={() => answer(null)}>
      <p className="muted">{prompt.fileName} is protected. Enter its password to open it.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          answer(pw)
        }}
        className="passForm"
      >
        <input type="password" className="wide" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {prompt.wrong && <p className="err">Incorrect password. Try again.</p>}
        <div className="modalActions">
          <span className="grow" />
          <button type="button" onClick={() => answer(null)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Open
          </button>
        </div>
      </form>
    </Modal>
  )
}
