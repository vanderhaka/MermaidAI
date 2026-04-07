import { listProjectsByUser } from '@/lib/services/project-service'
import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectList } from '@/components/dashboard/project-list'

export default async function DashboardPage() {
  const result = await listProjectsByUser()

  const projects = result.success ? result.data : []

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" data-testid="dashboard-page">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/70 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                Dashboard
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Build your decision system one project at a time.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Start with a high-level project, then step into modules, flows, and assistant-led
                  refinement without losing the bigger picture.
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:items-center">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Active projects
                </span>
                <span className="mt-1 block text-2xl font-semibold text-slate-900">
                  {projects.length}
                </span>
              </div>
              <LogoutButton />
            </div>
          </div>
        </header>

        <ProjectList projects={projects} />
      </div>
    </main>
  )
}
