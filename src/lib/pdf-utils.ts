import 'server-only'

// pdfjs-dist v6 требует worker в браузере, но в Node.js мы можем отключить его.
// Используем disableWorker + useSystemFonts для работы без worker.

// Динамический импорт чтобы избежать проблем с Turbopack bundling
export async function pdfToText(pdfBuffer: Buffer): Promise<string> {
  // Динамический импорт — avoids Turbopack trying to bundle pdf.worker.mjs
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const getDocument = pdfjsLib.getDocument

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise

  const numPages = pdf.numPages
  const pages: string[] = []

  for (let i = 1; i <= Math.min(numPages, 5); i++) {
    // максимум 5 страниц
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item: unknown) => {
        const it = item as { str?: string }
        return it.str || ''
      })
      .join(' ')
    pages.push(`--- Страница ${i} ---\n${text}`)
  }

  await pdf.cleanup?.()
  return pages.join('\n\n')
}

// Совместимость со старым именем
export async function pdfFirstPageToBase64(pdfBuffer: Buffer): Promise<string> {
  return pdfToText(pdfBuffer)
}
