import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between gap-12">
        <header className="flex items-center justify-between">
          <div className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm font-semibold tracking-[0.2em] text-slate-700 shadow-sm backdrop-blur">
            MermaidAI
          </div>

          <Link
            href="/login"
            className="inline-flex items-center rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-gray-300 hover:bg-white"
          >
            Existing account
          </Link>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm">
              AI-assisted decision design
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                Turn messy operational logic into clean, explorable systems.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                MermaidAI helps you break ideas into modules, map relationships, and refine the flow
                with an assistant that understands the project context.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-medium text-white shadow-lg shadow-slate-300/50 transition hover:bg-slate-800"
              >
                Start building
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-6 py-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white"
              >
                Sign in
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Project overview</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Keep a clear top-level map of the whole system.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Module detail</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Zoom into each module without losing context.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">AI refinement</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Generate and iterate on flows in the same workspace.
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Workflow
                </p>
                <h2 className="mt-3 text-2xl font-semibold">From idea to module map</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Start with a project, create modules, then grow the system one decision surface at
                  a time.
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  [
                    '1',
                    'Create a project shell',
                    'Capture the high-level system you want to design.',
                  ],
                  ['2', 'Add modules', 'Separate intake, processing, approvals, and outputs.'],
                  ['3', 'Refine with AI', 'Use the assistant panel to expand and iterate.'],
                ].map(([step, title, description]) => (
                  <div
                    key={step}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
                      {step}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
