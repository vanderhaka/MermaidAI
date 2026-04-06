'use client'

import { useRouter } from 'next/navigation'
import { createProject } from '@/lib/services/project-service'
import type { Project } from '@/types/graph'

type ProjectSummary = Pick<Project, 'id' | 'name' | 'description' | 'created_at' | 'updated_at'>

interface ProjectListProps {
  projects: ProjectSummary[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const router = useRouter()

  async function handleNewProject() {
    const result = await createProject({ name: 'Untitled Project' })
    if (result.success) {
      router.push(`/dashboard/${result.data.id}`)
    }
  }

  return (
    <section>
      <div>
        <h1>Projects</h1>
        <button onClick={handleNewProject}>New Project</button>
      </div>

      {projects.length === 0 ? (
        <p>No projects yet. Create one to get started.</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <button onClick={() => router.push(`/dashboard/${project.id}`)}>
                <span>{project.name}</span>
                {project.description && <span>{project.description}</span>}
                <time dateTime={project.created_at}>
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
