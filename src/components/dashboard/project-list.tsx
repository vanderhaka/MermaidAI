'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProject } from '@/lib/services/project-service'
import type { Project } from '@/types/graph'

type ProjectSummary = Pick<Project, 'id' | 'name' | 'description' | 'created_at' | 'updated_at'>

interface ProjectListProps {
  projects: ProjectSummary[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNewProject() {
    setIsCreating(true)
    setError(null)

    const result = await createProject({ name: 'Untitled Project' })

    if (result.success) {
      router.push(`/dashboard/${result.data.id}`)
      return
    }

    setError(result.error)
    setIsCreating(false)
  }

  return (
    <section className="space-y-5" data-testid="project-list">
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

        <button
          type="button"
          onClick={handleNewProject}
          disabled={isCreating}
          data-testid="new-project-button"
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-slate-300/60 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? 'Creating...' : 'New Project'}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
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
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/${project.id}`)}
                className="group flex w-full flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/85 p-6 text-left shadow-lg shadow-slate-200/60 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold tracking-tight text-slate-950">
                      {project.name}
                    </p>
                    <p className="text-sm leading-6 text-slate-600">
                      {project.description?.trim() ||
                        'Untitled project ready for its first module and flow.'}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Open
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Created
                    </p>
                    <time
                      dateTime={project.created_at}
                      className="mt-2 block text-sm font-medium text-slate-800"
                    >
                      {new Date(project.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </time>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Next step
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-800">
                      Open the workspace and add modules
                    </p>
                  </div>
                </div>

                <span className="text-sm font-medium text-slate-700 transition group-hover:text-slate-950">
                  Continue to workspace
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
