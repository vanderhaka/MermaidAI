import JSZip from 'jszip'

type PrdFile = {
  filename: string
  content: string
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Download a single markdown string as a .md file. */
export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  triggerDownload(blob, filename)
}

/** Download multiple PRD files as a ZIP archive. */
export async function downloadPrdZip(files: PrdFile[], projectName: string) {
  const zip = new JSZip()

  for (const file of files) {
    zip.file(file.filename, file.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  triggerDownload(blob, `${slug}-prd.zip`)
}
