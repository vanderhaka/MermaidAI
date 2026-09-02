'use client'

import { useCallback, useMemo } from 'react'
import Markdown from 'react-markdown'
import { useGraphStore } from '@/store/graph-store'
import { generatePrdFiles, generateSinglePrd } from '@/lib/services/prd-export-service'
import { downloadMarkdown, downloadPrdZip } from '@/lib/prd-download'
import { renderArchitectureBrief } from '@/lib/planning/architecture-brief-renderer'
import type { ArchitecturePlanningView } from '@/types/planning-ui'

type PrdPreviewPanelProps = {
  projectName: string
  projectDescription: string | null
  isOpen: boolean
  onClose: () => void
  architecturePlanning?: ArchitecturePlanningView
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
  architecturePlanning,
}: PrdPreviewPanelProps) {
  const modules = useGraphStore((s) => s.modules)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const connections = useGraphStore((s) => s.connections)
  const openQuestions = useGraphStore((s) => s.openQuestions)

  const usesArchitectureBrief = architecturePlanning !== undefined
  const hasAuthored = !usesArchitectureBrief && modules.some((m) => m.prd_content?.trim())

  const input = useMemo(
    () => ({ projectName, projectDescription, modules, nodes, edges, connections, openQuestions }),
    [projectName, projectDescription, modules, nodes, edges, connections, openQuestions],
  )

  const markdown = useMemo(() => {
    if (architecturePlanning?.version?.contentState === 'complete') {
      return renderArchitectureBrief({
        projectName,
        version: {
          id: architecturePlanning.version.id,
          version: architecturePlanning.version.version,
          contentHash: architecturePlanning.version.contentHash,
          content: architecturePlanning.version.content,
        },
        report: architecturePlanning.readinessReport,
        decisions: architecturePlanning.decisions,
      })
    }
    if (usesArchitectureBrief) return ''
    if (hasAuthored) return buildAuthoredMarkdown(projectName, modules)
    return generateSinglePrd(input)
  }, [architecturePlanning, hasAuthored, input, modules, projectName, usesArchitectureBrief])

  const activeVersion = architecturePlanning?.version ?? null
  const readinessReport = architecturePlanning?.readinessReport ?? null
  const reportMatchesVersion = Boolean(
    activeVersion &&
    readinessReport &&
    readinessReport.architectureVersionId === activeVersion.id &&
    readinessReport.architectureVersion === activeVersion.version &&
    readinessReport.architectureContentHash === activeVersion.contentHash &&
    readinessReport.evaluatedRevision === architecturePlanning?.expectedRevision,
  )
  const canDownloadArchitectureBrief = Boolean(
    activeVersion?.contentState === 'complete' &&
    reportMatchesVersion &&
    readinessReport?.freshness === 'current' &&
    readinessReport.handoffEligible,
  )

  let architectureGuidance: string[] = []
  if (usesArchitectureBrief) {
    if (!activeVersion || activeVersion.contentState === 'draft') {
      architectureGuidance = [
        'Generate the first Architecture map in chat before previewing or downloading a Brief.',
      ]
    } else if (!reportMatchesVersion) {
      architectureGuidance = [
        `Readiness has not been evaluated for the current Architecture v${activeVersion.version}. Refresh readiness before downloading.`,
      ]
    } else if (readinessReport?.freshness === 'stale') {
      architectureGuidance = [
        'The readiness report is stale. Refresh it against the current Architecture before downloading.',
      ]
    } else if (!readinessReport?.handoffEligible) {
      architectureGuidance = [
        ...(readinessReport?.reasons ?? []),
        ...(readinessReport?.reasons.length
          ? []
          : ['Resolve the remaining readiness gaps before downloading this Brief.']),
      ]
    }
  }

  const handleDownload = useCallback(async () => {
    const slug = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    if (usesArchitectureBrief && activeVersion?.contentState === 'complete') {
      if (!canDownloadArchitectureBrief) return
      downloadMarkdown(markdown, `${slug}-architecture-v${activeVersion.version}.md`)
    } else if (hasAuthored) {
      downloadMarkdown(markdown, `${slug}-prd.md`)
    } else if (modules.length > 1) {
      const files = generatePrdFiles(input)
      await downloadPrdZip(files, projectName)
    } else {
      downloadMarkdown(markdown, `${slug}-prd.md`)
    }
  }, [
    activeVersion,
    canDownloadArchitectureBrief,
    hasAuthored,
    input,
    markdown,
    modules.length,
    projectName,
    usesArchitectureBrief,
  ])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label={usesArchitectureBrief ? 'Architecture Brief Preview' : 'PRD Preview'}
        aria-modal="true"
        data-testid="prd-preview-panel"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {usesArchitectureBrief ? 'Architecture Brief' : 'Product Requirements'}
            </h2>
            {usesArchitectureBrief && activeVersion && (
              <p className="text-xs text-gray-400">Architecture v{activeVersion.version}</p>
            )}
            {!usesArchitectureBrief && !hasAuthored && (
              <p className="text-xs text-gray-400">
                Auto-generated from flowchart. Chat to build a detailed PRD.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(!usesArchitectureBrief || canDownloadArchitectureBrief) && (
              <button
                type="button"
                onClick={handleDownload}
                aria-label={usesArchitectureBrief ? 'Download Architecture Brief' : 'Download PRD'}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
              >
                Download .md
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={
                usesArchitectureBrief ? 'Close Architecture Brief preview' : 'Close PRD preview'
              }
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
          {architectureGuidance.length > 0 && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <p className="font-medium">This staged Brief is not ready to download.</p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                {architectureGuidance.map((guidance) => (
                  <li key={guidance}>{guidance}</li>
                ))}
              </ul>
            </div>
          )}
          {markdown.trim() ? (
            <article className="prose prose-sm prose-gray max-w-none">
              <Markdown>{markdown}</Markdown>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                {usesArchitectureBrief
                  ? 'No complete Architecture version is available yet.'
                  : 'No requirements captured yet. Start chatting to build your PRD.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
