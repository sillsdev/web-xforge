#!/usr/bin/env node
// Human/agent-friendly CLI for the mock-services control API.
// Usage: node client/cli.mjs <command> [json-args]   (or via the sf-mock bin)
//   reset [seedName]
//   state
//   user '{"email":"x@y","name":"X","paratext":{"ptUsername":"X"}}'
//   project '{"shortName":"ABC","templateBooks":["RUT"],"members":[...]}'
//   import-project /abs/path/to/ParatextProjectDir
//   commit <ptId> '{"bookCode":"RUT","usfm":"\\id RUT ..."}'
//   members <ptId> '[{"ptUserId":"...","role":"pt_translator"}]'
//   resource '{"name":"Res"}'
//   next-login <authId>
//   chaos '{"service":"registry","mode":"fail500","remaining":1}'
//   chaos-clear
//   revoke '{"authId":"...","kind":"auth0"}'

const base = process.env.MOCK_BASE_URL ?? 'http://localhost:5100';
const [command, ...rest] = process.argv.slice(2);

async function call(method, path, body) {
  const response = await fetch(`${base}/_control${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
  if (!response.ok) process.exit(1);
}

const json = arg => JSON.parse(arg ?? '{}');

switch (command) {
  case 'reset':
    await call('POST', `/reset?seed=${encodeURIComponent(rest[0] ?? 'default')}`);
    break;
  case 'state':
    await call('GET', '/state');
    break;
  case 'user':
    await call('POST', '/users', json(rest[0]));
    break;
  case 'project':
    await call('POST', '/projects', json(rest[0]));
    break;
  case 'import-project':
    await call('POST', '/projects/import', { dir: rest[0], ...json(rest[1]) });
    break;
  case 'commit':
    await call('POST', `/projects/${rest[0]}/commit`, json(rest[1]));
    break;
  case 'members':
    await call('PATCH', `/projects/${rest[0]}/members`, { members: json(rest[1]) });
    break;
  case 'resource':
    await call('POST', '/resources', json(rest[0]));
    break;
  case 'next-login':
    await call('POST', '/next-login', { authId: rest[0] });
    break;
  case 'chaos':
    await call('POST', '/chaos', json(rest[0]));
    break;
  case 'chaos-clear':
    await call('DELETE', '/chaos');
    break;
  case 'revoke':
    await call('POST', '/tokens/revoke', json(rest[0]));
    break;
  default:
    console.error('Unknown command. See header of client/cli.mjs for usage.');
    process.exit(1);
}
