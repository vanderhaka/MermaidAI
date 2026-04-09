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
            Sign in
          </Link>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm">
              Free while in beta
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                AI that builds flowcharts while you describe your project.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                Talk through what you&apos;re building. MermaidAI turns the conversation into a
                visual flowchart in real-time &mdash; decisions, processes, and open questions
                included.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-medium text-white shadow-lg shadow-slate-300/50 transition hover:bg-slate-800"
              >
                Start building &mdash; it&apos;s free
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Talk, don&apos;t draw</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Describe what you need. The AI builds the flowchart for you.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Nothing slips through</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Open questions are flagged automatically as you go.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Export-ready</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Download a requirements doc when you&apos;re done.
                </p>
              </div>
            </div>
          </div>

          {/* Product mockup — replace with real screenshot/GIF when available */}
          <aside
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/70"
            aria-label="Product preview"
          >
            {/* Fake title bar */}
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="ml-3 text-xs text-slate-400">MermaidAI</span>
            </div>
            <div className="grid grid-cols-[1fr_140px]">
              {/* Canvas area */}
              <div className="relative min-h-[280px] bg-slate-50/50 p-6">
                {/* Mock nodes */}
                <div className="absolute left-8 top-6 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
                  User signup
                </div>
                <div className="absolute left-[45%] top-6 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
                  Send welcome email
                </div>
                <div className="absolute left-8 top-[45%] rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 shadow-sm">
                  Verify identity?
                </div>
                <div className="absolute left-[45%] top-[45%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
                  Create account
                </div>
                <div className="absolute bottom-6 left-8 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 shadow-sm">
                  Who handles KYC?
                </div>
                {/* Connection lines */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  aria-hidden="true"
                >
                  <line x1="105" y1="38" x2="170" y2="38" stroke="#cbd5e1" strokeWidth="1.5" />
                  <line x1="60" y1="48" x2="60" y2="120" stroke="#cbd5e1" strokeWidth="1.5" />
                  <line x1="120" y1="135" x2="170" y2="135" stroke="#cbd5e1" strokeWidth="1.5" />
                </svg>
              </div>
              {/* Chat preview */}
              <div className="flex flex-col border-l border-slate-100 bg-white">
                <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Chat
                </div>
                <div className="flex-1 space-y-2 p-3">
                  <div className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
                    Walk me through your signup flow
                  </div>
                  <div className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] leading-snug text-blue-700">
                    I&apos;ve mapped the signup steps. Who handles identity verification?
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
