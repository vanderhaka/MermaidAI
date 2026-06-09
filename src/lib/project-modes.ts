import type { ChatMode } from '@/types/chat'
import type { ProjectMode } from '@/types/graph'

export const PROJECT_MODES = ['scope', 'architecture', 'flowchart', 'brainstorm'] as const

type SingleCanvasMode = Extract<ProjectMode, 'scope' | 'flowchart' | 'brainstorm'>
type SingleCanvasChatMode = Extract<
  ChatMode,
  'scope_build' | 'flowchart_build' | 'brainstorm_build'
>

type SingleCanvasModuleDefaults = {
  name: string
  description: string
  color: string
}

type ProjectModeConfig = {
  label: string
  selectorLabel: string
  selectorDescription: string
  selectorClassName: string
  badgeClassName: string
  singleCanvas: boolean
  chatMode?: SingleCanvasChatMode
  defaultModule?: SingleCanvasModuleDefaults
  workspaceLabel?: string
  welcomeMessage?: string
  chatSubtitle?: string
  examplePrompts?: string[]
  showFunnelLanes?: boolean
}

export const PROJECT_MODE_CONFIG: Record<ProjectMode, ProjectModeConfig> = {
  scope: {
    label: 'Scope',
    selectorLabel: 'Quick Capture',
    selectorDescription: 'Lightweight scoping for live client calls',
    selectorClassName:
      'rounded-xl border border-amber-300 bg-amber-50 p-3 text-left transition hover:border-amber-400 hover:bg-amber-100',
    badgeClassName: 'bg-amber-100 text-amber-800',
    singleCanvas: true,
    chatMode: 'scope_build',
    defaultModule: {
      name: 'Scope',
      description: 'Your Quick Capture session',
      color: '#F59E0B',
    },
    workspaceLabel: 'Quick Capture',
    welcomeMessage:
      'Welcome to Quick Capture! Describe what your client needs and I\'ll build a flowchart on the canvas in real-time.\n\nAs I work, hold **⌥ Option** to peek at your flowchart behind this chat.\n\nTry something like: *"The client needs a checkout flow with guest checkout and payment options."*',
    chatSubtitle: "Describe what the client needs — I'll build the flowchart.",
    examplePrompts: [
      'Client needs an invoicing system with approvals',
      'Map out a returns and refunds process',
      'Capture requirements for an event booking flow',
    ],
  },
  architecture: {
    label: 'Architecture',
    selectorLabel: 'Full Design',
    selectorDescription: 'Detailed system mapping with modules and flows',
    selectorClassName:
      'rounded-xl border border-blue-300 bg-blue-50 p-3 text-left transition hover:border-blue-400 hover:bg-blue-100',
    badgeClassName: 'bg-blue-100 text-blue-800',
    singleCanvas: false,
  },
  flowchart: {
    label: 'Flowchart',
    selectorLabel: 'Flowchart',
    selectorDescription: 'Chatty funnel maps for marketing and sales',
    selectorClassName:
      'rounded-xl border border-teal-300 bg-teal-50 p-3 text-left transition hover:border-teal-400 hover:bg-teal-100',
    badgeClassName: 'bg-teal-100 text-teal-800',
    singleCanvas: true,
    chatMode: 'flowchart_build',
    defaultModule: {
      name: 'Marketing Flowchart',
      description: 'A conversational funnel map for marketing and sales',
      color: '#14B8A6',
    },
    workspaceLabel: 'Flowchart',
    welcomeMessage:
      'Welcome to Flowchart mode! Chat through the funnel, customer journey, or sales process and I\'ll shape it into a clean flowchart as we go.\n\nAs I work, hold **⌥ Option** to peek at your flowchart behind this chat.\n\nTry something like: *"Map the lead journey from Instagram ad to booked consult."*',
    chatSubtitle: "Chat through the funnel — I'll build the flowchart.",
    examplePrompts: [
      'Map the funnel from ad click to booked consult',
      'Show the nurture path for leads who are not ready',
      'Create a follow-up funnel after a quote request',
    ],
    showFunnelLanes: true,
  },
  brainstorm: {
    label: 'Brainstorm',
    selectorLabel: 'Brainstorm',
    selectorDescription: 'Free-flow ideation — sketch, rework, and pressure-test a flow',
    selectorClassName:
      'rounded-xl border border-rose-300 bg-rose-50 p-3 text-left transition hover:border-rose-400 hover:bg-rose-100',
    badgeClassName: 'bg-rose-100 text-rose-800',
    singleCanvas: true,
    chatMode: 'brainstorm_build',
    defaultModule: {
      name: 'Brainstorm',
      description: 'Your brainstorm canvas',
      color: '#F43F5E',
    },
    workspaceLabel: 'Brainstorm',
    welcomeMessage:
      'Welcome to Brainstorm mode! Think out loud — I\'ll keep the flowchart in sync as we go, and after every change I\'ll ask the one question most worth answering next. We keep iterating until you\'re happy.\n\nYou can rework anything anytime: *"insert a review step between quote and invoice"*, *"that branch is wrong, redo it"*.\n\nAs I work, hold **⌥ Option** to peek at your flowchart behind this chat.',
    chatSubtitle: "Think out loud — I'll build, then ask the next smart question.",
    examplePrompts: [
      'Brainstorm an onboarding flow for a coaching app',
      'Sketch how refunds should work, then poke holes in it',
      'Map a rough idea: clients book, pay a deposit, get reminders',
    ],
  },
}

export function getProjectModeConfig(mode: ProjectMode): ProjectModeConfig {
  return PROJECT_MODE_CONFIG[mode]
}

export function isSingleCanvasMode(mode: ProjectMode): mode is SingleCanvasMode {
  return PROJECT_MODE_CONFIG[mode].singleCanvas
}

export function getSingleCanvasModuleDefaults(
  mode: ProjectMode,
): SingleCanvasModuleDefaults | null {
  return PROJECT_MODE_CONFIG[mode].defaultModule ?? null
}
