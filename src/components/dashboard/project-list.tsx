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
  const [error, setError] = useState<string | null>(null)

  async function handleNewProject() {
    setError(null)
    const result = await createProject({ name: 'Untitled Project' })
    if (result.success) {
      router.push(`/dashboard/${result.data.id}`)
    } else {
      setError(result.error ?? 'Failed to create project')
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
        <button
          onClick={handleNewProject}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          New Project
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-500">No projects yet. Create one to get started.</p>
          <button
            onClick={handleNewProject}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                onClick={() => router.push(`/dashboard/${project.id}`)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div>
                  <span className="text-base font-medium text-gray-900">{project.name}</span>
                  {project.description && (
                    <span className="mt-1 block text-sm text-gray-500">{project.description}</span>
                  )}
                </div>
                <time dateTime={project.created_at} className="shrink-0 text-sm text-gray-400">
                  {new Date(project.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
