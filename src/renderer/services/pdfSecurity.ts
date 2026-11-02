// NB: Buffer.asUint8Array() is a *view* into WASM memory that later calls can overwrite or free,
// so every result is copied with .slice() before it leaves this module.
// mupdf (WASM) does the structural compression and the encryption. It is loaded lazily so the
// ~10 MB module is only fetched when one of these tools is actually used.
type Mupdf = typeof import('mupdf')
let mupdfPromise: Promise<Mupdf> | null = null
const mupdf = (): Promise<Mupdf> => (mupdfPromise ??= import('mupdf'))

export interface Permissions {
  print: boolean
  copy: boolean
  edit: boolean
  annotate: boolean
}

export interface Protection {
  userPassword: string
  ownerPassword: string
  permissions: Permissions
}

export const ALL_PERMISSIONS: Permissions = { print: true, copy: true, edit: true, annotate: true }

/** PDF "P" flags: -4 allows everything; clear bits for what is denied. */
export function permissionBits(p: Permissions): number {
  let denied = 0
  if (!p.print) denied |= 4 | 2048 // print, high-quality print
  if (!p.edit) denied |= 8 | 1024 // modify contents, assemble pages
  if (!p.copy) denied |= 16 // copy text and images
  if (!p.annotate) denied |= 32 | 256 // annotations, fill forms
  return -4 & ~denied
}

async function open(bytes: Uint8Array, password?: string): Promise<import('mupdf').PDFDocument> {
  const m = await mupdf()
  const doc = m.Document.openDocument(bytes, 'application/pdf')
  if (doc.needsPassword() && !doc.authenticatePassword(password ?? '')) {
    throw new Error(password ? 'Incorrect password.' : 'This PDF is password protected.')
  }
  const pdf = doc.asPDF()
  if (!pdf) throw new Error('Not a PDF document.')
  return pdf
}

/** Deduplicate objects, drop unused ones and deflate every stream. */
export async function compressStructure(bytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await open(bytes)
  return pdf
    .saveToBuffer('garbage=deduplicate,compress=yes,compress-fonts=yes,compress-images=yes,objstms=yes')
    .asUint8Array().slice()
}

export async function protectPdf(bytes: Uint8Array, p: Protection): Promise<Uint8Array> {
  if (!p.userPassword && !p.ownerPassword) throw new Error('Enter a password.')
  const pdf = await open(bytes)
  // an owner password is required for permissions to mean anything; default to the open password
  const owner = p.ownerPassword || p.userPassword
  const opts = [
    'encrypt=aes-256',
    `user-password=${escapeOpt(p.userPassword)}`,
    `owner-password=${escapeOpt(owner)}`,
    `permissions=${permissionBits(p.permissions)}`
  ]
  return pdf.saveToBuffer(opts.join(',')).asUint8Array().slice()
}

/** Returns an unencrypted copy of a protected PDF. Throws "Incorrect password." on a bad password. */
export async function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const pdf = await open(bytes, password)
  return pdf.saveToBuffer('encrypt=no').asUint8Array().slice()
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  const m = await mupdf()
  return m.Document.openDocument(bytes, 'application/pdf').needsPassword()
}

// mupdf splits its option string on commas and '=', so keep passwords from breaking it
function escapeOpt(v: string): string {
  if (/[,=]/.test(v)) throw new Error('Passwords cannot contain "," or "=".')
  return v
}
