import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { countFormFields, flattenForm } from './pdfForms'

async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])
  const form = doc.getForm()
  form.createTextField('name').addToPage(page, { x: 40, y: 330, width: 200, height: 24 })
  form.createCheckBox('agree').addToPage(page, { x: 40, y: 280, width: 18, height: 18 })
  const dd = form.createDropdown('color')
  dd.addOptions(['Red', 'Green', 'Blue'])
  dd.addToPage(page, { x: 40, y: 220, width: 120, height: 24 })
  return doc.save()
}

describe('forms', () => {
  it('saves values entered through pdf.js annotationStorage', async () => {
    const pdf = await getDocument({ data: (await formPdf()).slice() }).promise
    const page = await pdf.getPage(1)
    const widgets = (await page.getAnnotations()).filter((a) => a.subtype === 'Widget')
    expect(widgets.length).toBe(3)
    const byName = Object.fromEntries(widgets.map((w) => [w.fieldName, w]))

    pdf.annotationStorage.setValue(byName.name.id, { value: 'Ada Lovelace' })
    pdf.annotationStorage.setValue(byName.agree.id, { value: true })
    pdf.annotationStorage.setValue(byName.color.id, { value: 'Green' })
    expect(pdf.annotationStorage.size).toBe(3)

    const saved = await pdf.saveDocument()
    const form = (await PDFDocument.load(saved)).getForm()
    expect(form.getTextField('name').getText()).toBe('Ada Lovelace')
    expect(form.getCheckBox('agree').isChecked()).toBe(true)
    expect(form.getDropdown('color').getSelected()).toEqual(['Green'])
  })

  it('flattens fields into page content', async () => {
    const flat = await flattenForm(await formPdf())
    expect(await countFormFields(flat)).toBe(0)
  })
})
