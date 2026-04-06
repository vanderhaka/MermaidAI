import { listProjectsByUser } from '@/lib/services/project-service'
import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectList } from '@/components/dashboard/project-list'

export default async function DashboardPage() {
  const result = await listProjectsByUser()

  const projects = result.success ? result.data : []

  return (
    <main>
      <header>
        <h1>Dashboard</h1>
        <LogoutButton />
      </header>
      <ProjectList projects={projects} />
    </main>
  )
}
