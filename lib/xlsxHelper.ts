import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'
import { todayUAE } from './dateUtils'

export interface ColDef {
  header: string
  key: string
  width?: number
  isDate?: boolean
  isCurrency?: boolean
  isArabic?: boolean
}

export async function buildXlsx(
  sheetName: string,
  columns: ColDef[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName.slice(0, 31))

  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }))

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
  headerRow.commit()

  ws.views = [{ state: 'frozen', ySplit: 1 }]

  for (const rowData of rows) {
    const row = ws.addRow(rowData)
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1)
      if (col.isDate && cell.value) {
        cell.numFmt = 'DD/MM/YYYY'
      }
      if (col.isCurrency && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00'
      }
      if (col.isArabic) {
        cell.alignment = { horizontal: 'right', readingOrder: 'rtl' }
      }
    })
    row.commit()
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

export async function buildMultiSheetXlsx(
  sheets: { name: string; columns: ColDef[]; rows: Record<string, unknown>[] }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }))
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
    headerRow.commit()
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const rowData of sheet.rows) {
      const row = ws.addRow(rowData)
      sheet.columns.forEach((col, i) => {
        const cell = row.getCell(i + 1)
        if (col.isDate && cell.value) cell.numFmt = 'DD/MM/YYYY'
        if (col.isCurrency && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        if (col.isArabic) cell.alignment = { horizontal: 'right', readingOrder: 'rtl' }
      })
      row.commit()
    }
  }
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

export function xlsxResponse(buffer: Buffer, filename: string): NextResponse {
  const today = todayUAE()
  return new NextResponse(buffer.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}_${today}.xlsx"`,
    },
  })
}
