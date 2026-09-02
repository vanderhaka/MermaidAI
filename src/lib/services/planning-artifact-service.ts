import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  parseArchitectureSnapshotContent,
  parseExecutionHandoffContent,
  parseWorkPlanContent,
} from '@/lib/planning/artifact-content'
import { planningArtifactKindSchema } from '@/lib/schemas/planning'
import { createClient } from '@/lib/supabase/server'
import type { Json, Tables } from '@/types/database'
import type {
  ArchitectureSnapshotContent,
  ExecutionHandoffContent,
  PlanningArtifactKind,
  PlanningArtifactVersionReference,
  WorkPlanContent,
} from '@/types/planning'

const uuidSchema = z.uuid()
const contentStateSchema = z.enum(['draft', 'complete'])

const planningArtifactRowSchema = z
  .object({
    id: uuidSchema,
    project_id: uuidSchema,
    kind: planningArtifactKindSchema,
    active_version_id: uuidSchema.nullable(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()

const planningArtifactVersionRowSchema = z
  .object({
    id: uuidSchema,
    artifact_id: uuidSchema,
    project_id: uuidSchema,
    version: z.number().int().positive(),
    content_state: contentStateSchema,
    content: z.unknown(),
    content_hash: z.string().trim().min(1),
    request_key: uuidSchema.nullable(),
    request_hash: z.string().trim().min(1).nullable(),
    readiness_report: z.unknown().nullable(),
    rendered_markdown: z.string().nullable(),
    provenance: z.unknown(),
    source_version_id: uuidSchema.nullable(),
    secondary_source_version_id: uuidSchema.nullable(),
    created_at: z.string().min(1),
  })
  .strict()

type PlanningArtifactRow = z.infer<typeof planningArtifactRowSchema>
type PlanningArtifactVersionRow = Tables<'planning_artifact_versions'>

export type PlanningContentByKind = {
  architecture: ArchitectureSnapshotContent
  work_plan: WorkPlanContent
  execution_handoff: ExecutionHandoffContent
}

type PlanningArtifactVersionBase<K extends PlanningArtifactKind> = {
  id: string
  artifact_id: string
  project_id: string
  artifact_kind: K
  version: number
  content_hash: string
  readiness_report: unknown | null
  rendered_markdown: string | null
  provenance: unknown
  source_version_id: string | null
  secondary_source_version_id: string | null
  created_at: string
}

export type DraftPlanningArtifactVersion<K extends PlanningArtifactKind = PlanningArtifactKind> =
  PlanningArtifactVersionBase<K> & {
    content_state: 'draft'
    content: null
    request_key: null
    request_hash: null
  }

export type CompletePlanningArtifactVersion<K extends PlanningArtifactKind = PlanningArtifactKind> =
  PlanningArtifactVersionBase<K> & {
    content_state: 'complete'
    content: PlanningContentByKind[K]
    request_key: string
    request_hash: string
  }

export type PlanningArtifactVersion<K extends PlanningArtifactKind = PlanningArtifactKind> =
  | DraftPlanningArtifactVersion<K>
  | CompletePlanningArtifactVersion<K>

export type PlanningArtifactServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type PlanningArtifactStaleReason = 'architecture_source_changed' | 'work_plan_source_changed'

export type PlanningArtifactStaleness = {
  isStale: boolean
  reasons: PlanningArtifactStaleReason[]
}

type StoredSources = {
  sourceVersionId: string | null
  secondarySourceVersionId: string | null
}

type ActiveSources = {
  activeArchitectureVersionId: string | null
  activeWorkPlanVersionId: string | null
}

type CreatePlanningArtifactVersionInput<K extends PlanningArtifactKind> = {
  projectId: string
  artifactKind: K
  requestKey: string
  content: unknown
}

function parseContent<K extends PlanningArtifactKind>(
  artifactKind: K,
  content: unknown,
): PlanningContentByKind[K] {
  switch (artifactKind) {
    case 'architecture':
      return parseArchitectureSnapshotContent(content) as PlanningContentByKind[K]
    case 'work_plan':
      return parseWorkPlanContent(content) as PlanningContentByKind[K]
    case 'execution_handoff':
      return parseExecutionHandoffContent(content) as PlanningContentByKind[K]
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    )
  }
  if (typeof value === 'string') {
    return value.normalize('NFC')
  }
  return value
}

function hashCanonicalValue(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

export function getPlanningContentHash<K extends PlanningArtifactKind>(
  artifactKind: K,
  content: unknown,
): string {
  return hashCanonicalValue(parseContent(artifactKind, content))
}

function sourceReferencesForContent<K extends PlanningArtifactKind>(
  artifactKind: K,
  content: PlanningContentByKind[K],
): PlanningArtifactVersionReference[] {
  if (artifactKind === 'architecture') {
    return []
  }
  if (artifactKind === 'work_plan') {
    return [(content as WorkPlanContent).source_architecture_version]
  }

  const handoff = content as ExecutionHandoffContent
  return [handoff.source_work_plan_version, handoff.source_architecture_version]
}

function validateStoredSourceChain<K extends PlanningArtifactKind>(
  artifactKind: K,
  row: z.infer<typeof planningArtifactVersionRowSchema>,
  content: PlanningContentByKind[K],
): void {
  if (artifactKind === 'architecture') {
    if (row.source_version_id !== null || row.secondary_source_version_id !== null) {
      throw new Error('Architecture versions cannot have source versions')
    }
    return
  }

  if (artifactKind === 'work_plan') {
    const workPlan = content as WorkPlanContent
    if (
      row.source_version_id !== workPlan.source_architecture_version.id ||
      row.secondary_source_version_id !== null
    ) {
      throw new Error('Stored Work Plan source does not match its content source')
    }
    return
  }

  const handoff = content as ExecutionHandoffContent
  if (
    row.source_version_id !== handoff.source_work_plan_version.id ||
    row.secondary_source_version_id !== handoff.source_architecture_version.id
  ) {
    throw new Error('Stored Execution Handoff sources do not match its content sources')
  }
}

export function decodePlanningArtifactVersion<K extends PlanningArtifactKind>(
  artifactKind: K,
  input: PlanningArtifactVersionRow | unknown,
): PlanningArtifactVersion<K> {
  const rowResult = planningArtifactVersionRowSchema.safeParse(input)
  if (!rowResult.success) {
    throw new Error(
      `Invalid planning artifact version: ${rowResult.error.issues[0]?.message ?? 'unknown shape'}`,
    )
  }
  const row = rowResult.data
  const base: PlanningArtifactVersionBase<K> = {
    id: row.id,
    artifact_id: row.artifact_id,
    project_id: row.project_id,
    artifact_kind: artifactKind,
    version: row.version,
    content_hash: row.content_hash,
    readiness_report: row.readiness_report,
    rendered_markdown: row.rendered_markdown,
    provenance: row.provenance,
    source_version_id: row.source_version_id,
    secondary_source_version_id: row.secondary_source_version_id,
    created_at: row.created_at,
  }

  if (row.content_state === 'draft') {
    if (row.request_key !== null || row.request_hash !== null) {
      throw new Error('Draft planning artifact versions cannot have a request identity')
    }
    return {
      ...base,
      content_state: 'draft',
      content: null,
      request_key: null,
      request_hash: null,
    }
  }

  if (row.request_key === null || row.request_hash === null) {
    throw new Error('Complete planning artifact versions require a request identity')
  }

  let content: PlanningContentByKind[K]
  try {
    content = parseContent(artifactKind, row.content)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown validation failure'
    throw new Error(`Invalid complete ${artifactKind} content: ${message}`)
  }
  validateStoredSourceChain(artifactKind, row, content)

  return {
    ...base,
    content_state: 'complete',
    content,
    request_key: row.request_key,
    request_hash: row.request_hash,
  }
}

export function derivePlanningArtifactStaleness(
  artifactKind: PlanningArtifactKind,
  storedSources: StoredSources,
  activeSources: ActiveSources,
): PlanningArtifactStaleness {
  const reasons: PlanningArtifactStaleReason[] = []

  if (
    artifactKind === 'execution_handoff' &&
    storedSources.sourceVersionId !== activeSources.activeWorkPlanVersionId
  ) {
    reasons.push('work_plan_source_changed')
  }
  if (
    artifactKind !== 'architecture' &&
    (artifactKind === 'work_plan'
      ? storedSources.sourceVersionId
      : storedSources.secondarySourceVersionId) !== activeSources.activeArchitectureVersionId
  ) {
    reasons.push('architecture_source_changed')
  }

  return { isStale: reasons.length > 0, reasons }
}

async function validateSourceVersionLabels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  references: PlanningArtifactVersionReference[],
): Promise<void> {
  if (references.length === 0) return

  for (const reference of references) {
    if (!uuidSchema.safeParse(reference.id).success) {
      throw new Error(`Invalid ${reference.artifact_kind} source version ID`)
    }
  }

  const { data, error } = await supabase
    .from('planning_artifact_versions')
    .select('id, version')
    .eq('project_id', projectId)
    .in(
      'id',
      references.map((reference) => reference.id),
    )

  if (error) throw new Error(error.message)

  const versionsById = new Map(data.map((row) => [row.id, row.version]))
  for (const reference of references) {
    if (versionsById.get(reference.id) !== reference.version) {
      throw new Error(
        `${reference.artifact_kind} source version label does not match the immutable source row`,
      )
    }
  }
}

export async function createPlanningArtifactVersion<K extends PlanningArtifactKind>(
  input: CreatePlanningArtifactVersionInput<K>,
): Promise<PlanningArtifactServiceResult<CompletePlanningArtifactVersion<K>>> {
  if (!uuidSchema.safeParse(input.projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }
  if (!uuidSchema.safeParse(input.requestKey).success) {
    return { success: false, error: 'Invalid request key' }
  }

  try {
    const content = parseContent(input.artifactKind, input.content)
    const sourceReferences = sourceReferencesForContent(input.artifactKind, content)
    const sourceVersionId = sourceReferences[0]?.id ?? null
    const secondarySourceVersionId = sourceReferences[1]?.id ?? null
    const contentHash = hashCanonicalValue(content)
    const requestHash = hashCanonicalValue({
      artifactKind: input.artifactKind,
      content,
      sourceVersionId,
      secondarySourceVersionId,
    })

    const supabase = await createClient()
    await validateSourceVersionLabels(supabase, input.projectId, sourceReferences)

    const { data: artifactData, error: artifactError } = await supabase
      .from('planning_artifacts')
      .upsert(
        { project_id: input.projectId, kind: input.artifactKind },
        { onConflict: 'project_id,kind' },
      )
      .select('*')
      .single()

    if (artifactError) {
      return { success: false, error: artifactError.message }
    }

    const artifactResult = planningArtifactRowSchema.safeParse(artifactData)
    if (!artifactResult.success || artifactResult.data.kind !== input.artifactKind) {
      return { success: false, error: 'Invalid planning artifact returned by database' }
    }
    const artifact = artifactResult.data

    const { data: versionData, error: versionError } = await supabase.rpc(
      'allocate_planning_artifact_version',
      {
        p_artifact_id: artifact.id,
        p_content: content as unknown as Json,
        p_content_hash: contentHash,
        p_request_key: input.requestKey,
        p_request_hash: requestHash,
        p_source_version_id: sourceVersionId,
        p_secondary_source_version_id: secondarySourceVersionId,
      },
    )

    if (versionError) {
      return { success: false, error: versionError.message }
    }

    const version = decodePlanningArtifactVersion(input.artifactKind, versionData)
    if (
      version.content_state !== 'complete' ||
      version.project_id !== input.projectId ||
      version.artifact_id !== artifact.id ||
      version.content_hash !== contentHash ||
      version.request_key !== input.requestKey ||
      version.request_hash !== requestHash
    ) {
      return { success: false, error: 'Allocated planning artifact version did not match request' }
    }

    return { success: true, data: version }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Planning artifact version creation failed',
    }
  }
}

async function loadArtifact(
  projectId: string,
  artifactKind: PlanningArtifactKind,
): Promise<PlanningArtifactServiceResult<PlanningArtifactRow | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_artifacts')
    .select('*')
    .eq('project_id', projectId)
    .eq('kind', artifactKind)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (data === null) return { success: true, data: null }

  const parsed = planningArtifactRowSchema.safeParse(data)
  if (!parsed.success || parsed.data.kind !== artifactKind) {
    return { success: false, error: 'Invalid planning artifact returned by database' }
  }
  return { success: true, data: parsed.data }
}

export async function getActivePlanningArtifactVersion<K extends PlanningArtifactKind>(
  projectId: string,
  artifactKind: K,
): Promise<PlanningArtifactServiceResult<PlanningArtifactVersion<K> | null>> {
  if (!uuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }

  const artifactResult = await loadArtifact(projectId, artifactKind)
  if (!artifactResult.success) return artifactResult
  if (artifactResult.data === null || artifactResult.data.active_version_id === null) {
    return { success: true, data: null }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_artifact_versions')
    .select('*')
    .eq('id', artifactResult.data.active_version_id)
    .eq('artifact_id', artifactResult.data.id)
    .single()

  if (error) return { success: false, error: error.message }

  try {
    return { success: true, data: decodePlanningArtifactVersion(artifactKind, data) }
  } catch (decodeError) {
    return {
      success: false,
      error:
        decodeError instanceof Error ? decodeError.message : 'Invalid planning artifact version',
    }
  }
}

export async function getPlanningArtifactVersion<K extends PlanningArtifactKind>(
  projectId: string,
  artifactKind: K,
  versionId: string,
): Promise<PlanningArtifactServiceResult<PlanningArtifactVersion<K> | null>> {
  if (!uuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }
  if (!uuidSchema.safeParse(versionId).success) {
    return { success: false, error: 'Invalid artifact version ID' }
  }

  const artifactResult = await loadArtifact(projectId, artifactKind)
  if (!artifactResult.success) return artifactResult
  if (artifactResult.data === null) return { success: true, data: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_artifact_versions')
    .select('*')
    .eq('project_id', projectId)
    .eq('artifact_id', artifactResult.data.id)
    .eq('id', versionId)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (data === null) return { success: true, data: null }

  try {
    return { success: true, data: decodePlanningArtifactVersion(artifactKind, data) }
  } catch (decodeError) {
    return {
      success: false,
      error:
        decodeError instanceof Error ? decodeError.message : 'Invalid planning artifact version',
    }
  }
}

export async function getPlanningArtifactStaleness(
  projectId: string,
  artifactKind: PlanningArtifactKind,
  versionId?: string,
): Promise<PlanningArtifactServiceResult<PlanningArtifactStaleness>> {
  if (!uuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }
  if (versionId !== undefined && !uuidSchema.safeParse(versionId).success) {
    return { success: false, error: 'Invalid artifact version ID' }
  }
  if (artifactKind === 'architecture') {
    return { success: true, data: { isStale: false, reasons: [] } }
  }

  const artifactResult = await loadArtifact(projectId, artifactKind)
  if (!artifactResult.success) return artifactResult
  const selectedVersionId = versionId ?? artifactResult.data?.active_version_id
  if (artifactResult.data === null || selectedVersionId == null) {
    return { success: false, error: 'Planning artifact version not found' }
  }

  const supabase = await createClient()
  const [versionResult, activeArtifactsResult] = await Promise.all([
    supabase
      .from('planning_artifact_versions')
      .select('source_version_id, secondary_source_version_id')
      .eq('project_id', projectId)
      .eq('artifact_id', artifactResult.data.id)
      .eq('id', selectedVersionId)
      .single(),
    supabase
      .from('planning_artifacts')
      .select('kind, active_version_id')
      .eq('project_id', projectId)
      .in('kind', ['architecture', 'work_plan']),
  ])

  if (versionResult.error) return { success: false, error: versionResult.error.message }
  if (activeArtifactsResult.error) {
    return { success: false, error: activeArtifactsResult.error.message }
  }

  const activeVersionByKind = new Map(
    activeArtifactsResult.data.map((artifact) => [artifact.kind, artifact.active_version_id]),
  )

  return {
    success: true,
    data: derivePlanningArtifactStaleness(
      artifactKind,
      {
        sourceVersionId: versionResult.data.source_version_id,
        secondarySourceVersionId: versionResult.data.secondary_source_version_id,
      },
      {
        activeArchitectureVersionId: activeVersionByKind.get('architecture') ?? null,
        activeWorkPlanVersionId: activeVersionByKind.get('work_plan') ?? null,
      },
    ),
  }
}
