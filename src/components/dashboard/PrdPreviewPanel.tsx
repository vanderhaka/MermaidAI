'use client'

import { useCallback, useMemo } from 'react'
import Markdown from 'react-markdown'
import { useGraphStore } from '@/store/graph-store'
import { generatePrdFiles, generateSinglePrd } from '@/lib/services/prd-export-service'
import { downloadMarkdown, downloadPrdZip } from '@/lib/prd-download'

type PrdPreviewPanelProps = {
  projectName: string
  projectDescription: string | null
  isOpen: boolean
  onClose: () => void
}

function buildAuthoredMarkdown(
  projectName: string,
  modules: { name: string; prd_content: string }[],
): string {
  const sections = modules.filter((m) => m.prd_content.trim())
  if (sections.length === 0) return ''

  if (sections.length === 1) return sections[0].prd_content

  return sections.map((m) => `# ${m.name}\n\n${m.prd_content}`).join('\n\n---\n\n')
}

export default function PrdPreviewPanel({
  projectName,
  projectDescription,
  isOpen,
  onClose,
}: PrdPreviewPanelProps) {
  const modules = useGraphStore((s) => s.modules)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const connections = useGraphStore((s) => s.connections)
  const openQuestions = useGraphStore((s) => s.openQuestions)

  const hasAuthored = modules.some((m) => m.prd_content?.trim())

  const input = useMemo(
    () => ({ projectName, projectDescription, modules, nodes, edges, connections, openQuestions }),
    [projectName, projectDescription, modules, nodes, edges, connections, openQuestions],
  )

  const markdown = useMemo(() => {
    if (hasAuthored) return buildAuthoredMarkdown(projectName, modules)
    return generateSinglePrd(input)
  }, [hasAuthored, projectName, modules, input])

  const handleDownload = useCallback(async () => {
    const slug = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    if (hasAuthored) {
      downloadMarkdown(markdown, `${slug}-prd.md`)
    } else if (modules.length > 1) {
      const files = generatePrdFiles(input)
      await downloadPrdZip(files, projectName)
    } else {
      downloadMarkdown(markdown, `${slug}-prd.md`)
    }
  }, [hasAuthored, input, markdown, modules.length, projectName])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="PRD Preview"
        data-testid="prd-preview-panel"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Product Requirements</h2>
            {!hasAuthored && (
              <p className="text-xs text-gray-400">
                Auto-generated from flowchart. Chat to build a detailed PRD.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              aria-label="Download PRD"
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
            >
              Download .md
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PRD preview"
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {markdown.trim() ? (
            <article className="prose prose-sm prose-gray max-w-none">
              <Markdown>{markdown}</Markdown>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                No requirements captured yet. Start chatting to build your PRD.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
