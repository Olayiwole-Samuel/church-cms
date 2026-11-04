import ExcelJS from "exceljs";

type Row = Record<string, unknown>;

/** Names and notes can come from public forms, so neutralise spreadsheet formulas. */
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function toCsv(rows: Row[], columns: string[]): string {
  const escape = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(safeCell(row[c]))).join(","));
  // BOM so Excel opens non-ASCII names correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx(sheets: { name: string; rows: Row[]; columns: string[] }[]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow(sheet.columns);
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) ws.addRow(sheet.columns.map((c) => safeCell(row[c])));
    ws.columns.forEach((col, i) => {
      col.width = Math.min(40, Math.max(12, sheet.columns[i].length + 2));
    });
  }
  return (await book.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}
