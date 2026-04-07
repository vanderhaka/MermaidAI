export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-[2rem] border border-white/70 bg-slate-950 px-8 py-10 text-white shadow-2xl lg:block">
          <div className="max-w-lg space-y-8">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
              MermaidAI
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white">
                Shape complex decisions into modules your team can actually use.
              </h1>
              <p className="text-base leading-7 text-slate-300">
                Map the moving parts, sketch module logic, and refine flows with AI support in one
                focused workspace.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-white">Module-first</p>
                <p className="mt-2 text-sm text-slate-300">
                  Break large systems into smaller pieces.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-white">AI guidance</p>
                <p className="mt-2 text-sm text-slate-300">
                  Iterate on logic with assistant context.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-white">Visual flow</p>
                <p className="mt-2 text-sm text-slate-300">Keep decisions visible and organized.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="mx-auto w-full max-w-md rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-xl shadow-slate-200/70 backdrop-blur">
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
