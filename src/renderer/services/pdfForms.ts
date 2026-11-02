import { PDFDocument } from 'pdf-lib'

export async function flattenForm(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const form = doc.getForm()
  if (form.getFields().length === 0) return bytes
  form.flatten()
  return doc.save()
}

export async function countFormFields(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  return doc.getForm().getFields().length
}
