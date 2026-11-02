import { describe, expect, it } from 'vitest'
import { protectedName, withFileName } from './fileNames'

describe('file names', () => {
  it('appends _Protected before the extension', () => {
    expect(protectedName('report.pdf')).toBe('report_Protected.pdf')
    expect(protectedName('Report.PDF')).toBe('Report_Protected.pdf')
    expect(protectedName('no-extension')).toBe('no-extension_Protected.pdf')
  })

  it('does not add the suffix twice', () => {
    expect(protectedName('report_Protected.pdf')).toBe('report_Protected.pdf')
    expect(protectedName('report_protected.pdf')).toBe('report_protected.pdf')
  })

  it('keeps the folder when renaming', () => {
    expect(withFileName('C:\\docs\\report.pdf', 'report_Protected.pdf')).toBe('C:\\docs\\report_Protected.pdf')
    expect(withFileName('/home/a/report.pdf', 'x.pdf')).toBe('/home/a/x.pdf')
    expect(withFileName('report.pdf', 'x.pdf')).toBe('x.pdf')
  })
})
