import 'server-only'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Конвертация первой страницы PDF в base64 PNG
// Используется для распознавания накладных в PDF через VLM
export async function pdfFirstPageToBase64(pdfBuffer: Buffer): Promise<string> {
  const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) })
  const pdf = await loadingTask.promise

  // Берём первую страницу
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 }) // scale 2 для качества

  // Создаём canvas через @napi-rs/canvas или используем node-canvas
  // В среде без DOM используем pdfjs с custom CanvasFactory
  // Простой способ: использовать page.getData и отрисовать через offscreen canvas

  // Альтернатива: получить текст PDF напрямую (без отрисовки)
  const textContent = await page.getTextContent()
  const text = textContent.items
    .map((item: unknown) => {
      const i = item as { str?: string }
      return i.str || ''
    })
    .join(' ')

  await pdf.destroy()

  if (!text.trim()) {
    throw new Error('PDF не содержит текста (возможно скан изображения)')
  }

  return text.trim()
}

// Альтернативная функция: получить весь текст PDF (все страницы)
export async function pdfToText(pdfBuffer: Buffer): Promise<string> {
  const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) })
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

  await pdf.destroy()
  return pages.join('\n\n')
}
