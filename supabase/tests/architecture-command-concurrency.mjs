import { spawn, spawnSync } from 'node:child_process'

const containerName = process.argv[2]

if (!containerName || !/^supabase_db_[a-zA-Z0-9._-]+$/.test(containerName)) {
  throw new Error('Pass the isolated local Supabase database container name')
}

const ownerId = '10000000-0000-4000-8000-000000000003'
const projectId = '20000000-0000-4000-8000-000000000003'

const runSql = (sql) => {
  const result = spawnSync(
    'docker',
    ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres'],
    { input: `\\set ON_ERROR_STOP on\n${sql}`, encoding: 'utf8' },
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Local database command failed')
  }

  return result.stdout
}

const runSqlAsync = (sql) =>
  new Promise((resolve) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      containerName,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ])
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(`\\set ON_ERROR_STOP on\n${sql}`)
  })

const authenticatedPrefix = `
set role authenticated;
select set_config('request.jwt.claim.sub', '${ownerId}', false);
`

const commandSql = ({ changeSetId, operationId, turnId, requestHash, x }) => `
${authenticatedPrefix}
select public.apply_architecture_command(
  '${projectId}'::uuid,
  '${changeSetId}'::uuid,
  '${turnId}'::uuid,
  0,
  '${requestHash}',
  jsonb_build_array(jsonb_build_object(
    'type', 'architecture.viewport.set',
    'operationId', '${operationId}'::uuid,
    'viewport', jsonb_build_object('x', ${x}, 'y', 20, 'zoom', 1.25)
  )),
  null,
  null
);
`

try {
  runSql(`
    delete from public.projects where id = '${projectId}'::uuid;
    delete from auth.users where id = '${ownerId}'::uuid;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '${ownerId}',
      'authenticated', 'authenticated', 'planning-concurrency@example.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    );

    ${authenticatedPrefix}
    insert into public.projects (id, user_id, name, mode)
    values ('${projectId}', '${ownerId}', 'Planning concurrency proof', 'architecture');
    select public.initialize_architecture_planning_state('${projectId}'::uuid);
  `)

  const outcomes = await Promise.all([
    runSqlAsync(
      commandSql({
        changeSetId: 'a7000000-0000-4000-8000-000000000001',
        operationId: 'b7000000-0000-4000-8000-000000000001',
        turnId: 'c7000000-0000-4000-8000-000000000001',
        requestHash: 'concurrent-client-one',
        x: 10,
      }),
    ),
    runSqlAsync(
      commandSql({
        changeSetId: 'a7000000-0000-4000-8000-000000000002',
        operationId: 'b7000000-0000-4000-8000-000000000002',
        turnId: 'c7000000-0000-4000-8000-000000000002',
        requestHash: 'concurrent-client-two',
        x: 30,
      }),
    ),
  ])

  const successful = outcomes.filter(({ status }) => status === 0)
  const stale = outcomes.filter(
    ({ status, stderr }) => status !== 0 && stderr.includes('Stale planning revision'),
  )

  if (successful.length !== 1 || stale.length !== 1) {
    throw new Error(
      `Expected one commit and one stale conflict, received statuses ${outcomes
        .map(({ status }) => status)
        .join(', ')}`,
    )
  }

  runSql(`
    ${authenticatedPrefix}
    do $verify$
    begin
      if (select write_safety_revision from public.planning_states where project_id = '${projectId}') <> 1
        or (select count(*) from public.planning_change_sets where project_id = '${projectId}') <> 1
        or (select count(*) from public.planning_operations where project_id = '${projectId}') <> 1 then
        raise exception 'Concurrent Architecture commands did not leave exactly one committed winner';
      end if;
    end;
    $verify$;
  `)

  process.stdout.write('PASS: two clients from revision 0 produced one commit and one stale conflict\n')
} finally {
  runSql(`
    reset role;
    delete from public.projects where id = '${projectId}'::uuid;
    delete from auth.users where id = '${ownerId}'::uuid;
  `)
}
