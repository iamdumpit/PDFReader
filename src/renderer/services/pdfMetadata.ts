import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib'

export interface MetadataInfo {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  producer?: string
  created?: string
  modified?: string
  /** other keys found in the Info dictionary */
  custom: string[]
  hasXmp: boolean
  /** annotations carrying an author/title (T) or modification date */
  annotationAuthors: number
}

export interface StripOptions {
  /** also remove the author name and dates stored on annotations/comments */
  annotationAuthors: boolean
}

const STANDARD = new Set(['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'])
const load = (bytes: Uint8Array): Promise<PDFDocument> =>
  PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })

function annotDicts(doc: PDFDocument): PDFDict[] {
  const out: PDFDict[] = []
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const d = annots.lookupMaybe(i, PDFDict)
      if (d) out.push(d)
    }
  }
  return out
}

export async function readMetadata(bytes: Uint8Array): Promise<MetadataInfo> {
  const doc = await load(bytes)
  const infoDict = doc.context.lookupMaybe(doc.context.trailerInfo.Info, PDFDict)
  const custom = infoDict
    ? infoDict
        .keys()
        .map((k) => k.decodeText())
        .filter((k) => !STANDARD.has(k))
    : []
  const fmt = (d?: Date): string | undefined => (d ? d.toISOString().replace('T', ' ').slice(0, 19) : undefined)
  return {
    title: doc.getTitle(),
    author: doc.getAuthor(),
    subject: doc.getSubject(),
    keywords: doc.getKeywords(),
    creator: doc.getCreator(),
    producer: doc.getProducer(),
    created: fmt(doc.getCreationDate()),
    modified: fmt(doc.getModificationDate()),
    custom,
    hasXmp: doc.catalog.has(PDFName.of('Metadata')),
    annotationAuthors: annotDicts(doc).filter((d) => d.has(PDFName.of('T')) || d.has(PDFName.of('M'))).length
  }
}

export function hasAnyMetadata(m: MetadataInfo): boolean {
  return !!(
    m.title || m.author || m.subject || m.keywords || m.creator || m.producer || m.created || m.modified ||
    m.custom.length || m.hasXmp
  )
}

/** Remove the Info dictionary, XMP packets and private application data (PieceInfo). */
export async function stripMetadata(bytes: Uint8Array, opts: StripOptions): Promise<Uint8Array> {
  const doc = await load(bytes)
  const ctx = doc.context

  // document information dictionary
  const infoRef = ctx.trailerInfo.Info
  if (infoRef) {
    const info = ctx.lookupMaybe(infoRef, PDFDict)
    info?.keys().forEach((k) => info.delete(k))
    ctx.trailerInfo.Info = undefined
  }

  const strip = (d: PDFDict): void => {
    d.delete(PDFName.of('Metadata'))
    d.delete(PDFName.of('PieceInfo'))
  }
  strip(doc.catalog)
  for (const page of doc.getPages()) strip(page.node)

  if (opts.annotationAuthors) {
    for (const d of annotDicts(doc)) {
      for (const key of ['T', 'M', 'CreationDate']) d.delete(PDFName.of(key))
    }
  }
  return doc.save()
}
