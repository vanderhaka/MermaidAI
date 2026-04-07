import type { Database } from '@/types/database'
import type { FlowNodeType } from '@/types/graph'

type FlowNodeInsert = Database['public']['Tables']['flow_nodes']['Insert']
type FlowEdgeInsert = Database['public']['Tables']['flow_edges']['Insert']

/** Stable UUIDs so edges reference nodes deterministically when the template is applied once. */
const CART_IDS = {
  start: '7ca1e9c8-318c-4033-bc45-96418dc5bfff',
  lineItems: '0bcc3b43-5d98-4e12-b5e8-9fb115c9c38d',
  resolveVariant: '53f345d8-63b8-45f0-a042-8cd99924fb6f',
  inventoryRead: 'feb1a411-92b3-4b8f-8402-db725fbde6ee',
  stockOk: '9cdb10dc-26f0-42dc-b2ee-3a74450d3c72',
  stockWarnings: 'e6118f61-6085-4289-bedc-2a5f71551e10',
  isAuthed: 'e7802ceb-77b9-4a45-a7ff-e475e7ce1a59',
  persistDb: '229bf1f5-8d4a-4ffe-afc1-b22861424879',
  persistLocal: '16d8b339-a229-40d3-8036-ff893e0d64f2',
  inventoryWatch: 'b8c0a4d9-0fe6-464d-90b0-6c7f89594150',
  mergeOnLogin: '99c6be44-f400-4664-9457-72840f87fb75',
  couponOptional: 'd2111d8c-dc65-4e34-9ad2-34d8fccd5c35',
  exitCheckout: '8ca04f13-9e95-4384-9fc6-43347c006a6d',
} as const

const COL = {
  start: '#15803d',
  process: '#1e293b',
  decision: '#0f766e',
  exit: '#b45309',
}

function node(
  moduleId: string,
  id: string,
  node_type: FlowNodeType,
  label: string,
  pseudocode: string,
  color: string,
): FlowNodeInsert {
  return {
    id,
    module_id: moduleId,
    node_type,
    label,
    pseudocode,
    position_x: 0,
    position_y: 0,
    color,
  }
}

function edge(
  moduleId: string,
  source_node_id: string,
  target_node_id: string,
  label: string | null,
  condition: string | null,
): FlowEdgeInsert {
  return {
    module_id: moduleId,
    source_node_id,
    target_node_id,
    label,
    condition,
  }
}

/**
 * Default internal flow for the Cart module: variants, persistence, merge, real-time stock.
 */
export function buildCartFlowRows(moduleId: string): {
  nodes: FlowNodeInsert[]
  edges: FlowEdgeInsert[]
} {
  const n = CART_IDS

  const nodes: FlowNodeInsert[] = [
    node(
      moduleId,
      n.start,
      'start',
      'Cart session',
      'Entry: user opens cart from PDP, mini-cart, or deep link.',
      COL.start,
    ),
    node(
      moduleId,
      n.lineItems,
      'process',
      'Add / update / remove line items',
      'Supports product variants (size, color, etc.). Validates min/max qty and per-line notes.',
      COL.process,
    ),
    node(
      moduleId,
      n.resolveVariant,
      'process',
      'Resolve variant → inventory SKU',
      'Maps configurable options to the canonical SKU the inventory service uses.',
      COL.process,
    ),
    node(
      moduleId,
      n.inventoryRead,
      'process',
      'Real-time inventory read',
      'Calls inventory (or cache with TTL); subscribe/poll while cart is open.',
      COL.process,
    ),
    node(
      moduleId,
      n.stockOk,
      'decision',
      'Enough stock for requested qty?',
      'Compare available vs line qty; flag low-stock thresholds for UX.',
      COL.decision,
    ),
    node(
      moduleId,
      n.stockWarnings,
      'process',
      'Out of stock / low stock UX',
      'Block checkout on OOS; suggest alternatives; allow qty adjust → back to line items.',
      COL.process,
    ),
    node(
      moduleId,
      n.isAuthed,
      'decision',
      'Authenticated shopper?',
      'Branch: persisted server cart vs guest local cart.',
      COL.decision,
    ),
    node(
      moduleId,
      n.persistDb,
      'process',
      'Persist cart (database)',
      'Upsert rows keyed by user + SKU/variant; optimistic concurrency on qty.',
      COL.process,
    ),
    node(
      moduleId,
      n.persistLocal,
      'process',
      'Persist cart (localStorage)',
      'Guest cart blob + anonymous id; size-capped; migrate on sign-in.',
      COL.process,
    ),
    node(
      moduleId,
      n.inventoryWatch,
      'process',
      'Keep inventory fresh',
      'Poll or websocket: update badges; auto-adjust if stock drops.',
      COL.process,
    ),
    node(
      moduleId,
      n.mergeOnLogin,
      'process',
      'Merge on login',
      'Union guest + server lines; conflict policy (e.g. max qty, latest wins).',
      COL.process,
    ),
    node(
      moduleId,
      n.couponOptional,
      'process',
      'Apply / refresh coupon (optional)',
      'Revalidate promos when cart changes; show deltas in totals.',
      COL.process,
    ),
    node(
      moduleId,
      n.exitCheckout,
      'exit',
      'Continue to checkout',
      'Exit point: hand off priced cart + eligibility to Checkout module.',
      COL.exit,
    ),
  ]

  const edges: FlowEdgeInsert[] = [
    edge(moduleId, n.start, n.lineItems, null, null),
    edge(moduleId, n.lineItems, n.resolveVariant, null, null),
    edge(moduleId, n.resolveVariant, n.inventoryRead, null, null),
    edge(moduleId, n.inventoryRead, n.stockOk, null, null),
    edge(moduleId, n.stockOk, n.isAuthed, 'yes', 'Sufficient stock'),
    edge(moduleId, n.stockOk, n.stockWarnings, 'no', 'Insufficient or OOS'),
    edge(moduleId, n.stockWarnings, n.lineItems, 'adjust', 'User changes qty or SKU'),
    edge(moduleId, n.isAuthed, n.persistDb, 'yes', 'Logged in'),
    edge(moduleId, n.isAuthed, n.persistLocal, 'no', 'Guest'),
    edge(moduleId, n.persistDb, n.inventoryWatch, null, null),
    edge(moduleId, n.persistLocal, n.inventoryWatch, null, null),
    edge(moduleId, n.inventoryWatch, n.mergeOnLogin, null, null),
    edge(moduleId, n.mergeOnLogin, n.couponOptional, null, null),
    edge(moduleId, n.couponOptional, n.exitCheckout, null, null),
  ]

  return { nodes, edges }
}
