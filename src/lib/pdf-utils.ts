import 'server-only'

// Использует pdf-parse v1 (pure JS, без worker, без Turbopack проблем)
// Импортируем напрямую lib/pdf-parse.js чтобы обойти debug-режим в index.js
// который пытается читать тестовый файл при build time

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js')

export async function pdfToText(pdfBuffer: Buffer): Promise<string> {
  const data = await pdfParse(pdfBuffer)
  return data.text || ''
}

// Совместимость со старым именем
export async function pdfFirstPageToBase64(pdfBuffer: Buffer): Promise<string> {
  return pdfToText(pdfBuffer)
}
