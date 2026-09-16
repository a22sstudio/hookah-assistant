import 'server-only'

// Использует pdf-parse v1 (pure JS, без worker, без Turbopack проблем)
// API: const data = await pdfParse(buffer) → { text, numpages, ... }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

export async function pdfToText(pdfBuffer: Buffer): Promise<string> {
  const data = await pdfParse(pdfBuffer)
  return data.text || ''
}

// Совместимость со старым именем
export async function pdfFirstPageToBase64(pdfBuffer: Buffer): Promise<string> {
  return pdfToText(pdfBuffer)
}
