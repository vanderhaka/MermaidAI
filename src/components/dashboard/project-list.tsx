'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProject, deleteProject } from '@/lib/services/project-service'
import type { Project } from '@/types/graph'

type ProjectSummary = Pick<
  Project,
  'id' | 'name' | 'description' | 'mode' | 'created_at' | 'updated_at'
>

interface ProjectListProps {
  projects: ProjectSummary[]
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`

  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ProjectCard({ project, onDeleted }: { project: ProjectSummary; onDeleted: () => void }) {
  const router = useRouter()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()

    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }

    setIsDeleting(true)
    const result = await deleteProject(project.id)
    if (result.success) {
      onDeleted()
    }
    setIsDeleting(false)
    setConfirmingDelete(false)
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmingDelete(false)
  }

  return (
    <li>
      <div className="group relative flex w-full flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/85 p-6 text-left shadow-lg shadow-slate-200/60 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/${project.id}`)}
          className="absolute inset-0 rounded-[2rem]"
          aria-label={`Open ${project.name}`}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold tracking-tight text-slate-950">{project.name}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  project.mode === 'scope'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {project.mode === 'scope' ? 'Scope' : 'Architecture'}
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              {project.description?.trim() ||
                'Untitled project ready for its first module and flow.'}
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-2">
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm delete'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                aria-label={`Delete ${project.name}`}
                className="rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
              clipRule="evenodd"
            />
          </svg>
          <time dateTime={project.updated_at}>
            Updated {formatRelativeTime(project.updated_at)}
          </time>
        </div>

        <span className="text-sm font-medium text-slate-700 transition group-hover:text-slate-950">
          Continue to workspace
        </span>
      </div>
    </li>
  )
}

export function ProjectList({ projects }: ProjectListProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'scope' | 'architecture'>('all')

  async function handleCreateWithMode(mode: 'scope' | 'architecture') {
    setIsCreating(true)
    setShowModeSelector(false)
    setError(null)

    const result = await createProject({ name: 'Untitled Project', mode })

    if (result.success) {
      router.push(`/dashboard/${result.data.id}`)
      return
    }

    setError(result.error)
    setIsCreating(false)
  }

  return (
    <section className="relative space-y-5" data-testid="project-list">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/70 backdrop-blur sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Projects
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Choose a workspace to continue.
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Each project can hold its own module map, AI conversation history, and flow detail.
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowModeSelector(true)}
            disabled={isCreating}
            data-testid="new-project-button"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-slate-300/60 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? 'Creating...' : 'New Project'}
          </button>
        </div>
      </div>

      {showModeSelector && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-end px-6 pt-20">
          <div
            data-testid="mode-selector"
            className="pointer-events-auto w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Choose mode
              </p>
              <button
                type="button"
                onClick={() => setShowModeSelector(false)}
                aria-label="Dismiss"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => handleCreateWithMode('scope')}
                className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-left transition hover:border-amber-400 hover:bg-amber-100"
              >
                <p className="text-sm font-bold text-slate-900">Quick Capture</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Lightweight scoping for live client calls
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleCreateWithMode('architecture')}
                className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-left transition hover:border-blue-400 hover:bg-blue-100"
              >
                <p className="text-sm font-bold text-slate-900">Full Design</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Detailed system mapping with modules and flows
                </p>
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              Not sure? Start with Quick Capture &mdash; you can switch to Full Design later.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {projects.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ['all', 'All'],
                ['scope', 'Quick Capture'],
                ['architecture', 'Full Design'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setModeFilter(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  modeFilter === value
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div
          className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 shadow-sm"
          data-testid="project-empty-state"
        >
          <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-semibold text-white shadow-lg shadow-slate-300/60">
              01
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                No projects yet. Create one to get started.
              </h3>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                Start with a project shell, then add modules and iterate on the system with the
                assistant once you enter the workspace.
              </p>
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Module map</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Keep the big picture visible before diving into a single flow.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Assistant context</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Use the chat panel to sketch and refine your module logic in place.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {projects
            .filter(
              (p) =>
                (modeFilter === 'all' || p.mode === modeFilter) &&
                (!search ||
                  p.name.toLowerCase().includes(search.toLowerCase()) ||
                  p.description?.toLowerCase().includes(search.toLowerCase())),
            )
            .map((project) => (
              <ProjectCard key={project.id} project={project} onDeleted={() => router.refresh()} />
            ))}
        </ul>
      )}
    </section>
  )
}
