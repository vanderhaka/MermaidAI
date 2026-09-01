import type { FlowEdge, FlowNode } from '@/types/graph'

const MAX_PSEUDOCODE_PER_NODE = 450

export const OPINIONATED_RECOMMENDATION_INSTRUCTIONS = `
## Opinionated Follow-ups

When you ask a follow-up question, include exactly one recommended default answer immediately after it on its own line:
\`Recommended answer: <one concise default the user can safely accept>\`

Make the recommendation practical, opinionated, and specific to the current flow. Do not list multiple options; the user can override in chat if they disagree.`

export const HELPER_MODE_INSTRUCTIONS = `
## Auto-Decide Mode — decide the obvious

Auto-decide is ON. When a decision point has one answer that fits 90 of 100 projects like this, decide it yourself — do not ask about it and do not create an open question for it. Apply the sensible industry default, then record it:
1. Add one short line to your reply for each such decision: "Assumed: <the decision in plain language>".
2. Log the same decisions in the PRD via write_prd under a "## Assumed defaults" heading.

Reserve your follow-up question and open questions for genuinely material points only: money and payment timing, business rules specific to this client, external contracts and integrations the client must choose, legal or liability exposure, and anything the client must own. If you are unsure whether a point is material, treat it as material and ask.`

export function buildCurrentNodesSection(nodes?: FlowNode[]): string {
  if (!nodes || nodes.length === 0) {
    return 'No nodes exist yet in this module.'
  }

  const lines = nodes.map((n) => {
    const head = `- **${n.label}** (id: ${n.id}, type: ${n.node_type})`
    const pc = n.pseudocode?.trim()
    if (!pc) return head
    const raw =
      pc.length > MAX_PSEUDOCODE_PER_NODE ? `${pc.slice(0, MAX_PSEUDOCODE_PER_NODE)}…` : pc
    const snippet = raw.replace(/`/g, "'")
    return `${head}\n  Pseudocode:\n  \`\`\`\n  ${snippet}\n  \`\`\``
  })

  return `Current nodes:\n${lines.join('\n\n')}`
}

export function buildCurrentEdgesSection(edges?: FlowEdge[]): string {
  if (!edges || edges.length === 0) {
    return 'No edges exist yet in this module.'
  }

  const lines = edges.map((e) => {
    const label = e.label ? ` [${e.label}]` : ''
    return `- ${e.source_node_id} → ${e.target_node_id}${label} (id: ${e.id})`
  })

  return `Current edges:\n${lines.join('\n')}`
}
