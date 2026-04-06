import { listProjectsByUser } from '@/lib/services/project-service'
import { ProjectList } from '@/components/dashboard/project-list'

export default async function DashboardPage() {
  const result = await listProjectsByUser()

  const projects = result.success ? result.data : []

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="mt-8">
          <ProjectList projects={projects} />
        </div>
      </div>
    </main>
  )
}
