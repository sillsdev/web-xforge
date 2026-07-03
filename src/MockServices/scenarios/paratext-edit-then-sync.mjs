#!/usr/bin/env node
// Example scenario: reproduce a "set up X in a Paratext project, then sync" tracker issue.
// Run the mock server + SF app first, then: node scenarios/paratext-edit-then-sync.mjs
//
// This resets to the default seed, then simulates a Paratext-side edit to Ruth in the target
// project. After running this, sync the project in SF (or drive it with Playwright) and the
// edited verse should arrive. Add a conflicting SF-side edit before syncing to exercise merges.

const BASE = process.env.MOCK_BASE_URL ?? 'http://localhost:5100';
const TARGET_PTID = 'a'.repeat(39) + '2'; // MTRG from the default seed

async function control(method, path, body) {
  const res = await fetch(`${BASE}/_control${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
  return json;
}

await control('POST', '/reset?seed=default');
console.log('reset to default seed');

const edited = `\\id RUT - Mock Scripture for testing
\\h Ruth
\\mt1 Ruth
\\c 1
\\p
\\v 1 EDITED IN PARATEXT: In the days when the judges ruled, there was a famine in the land.
\\v 2 The man's name was Elimelek, his wife's name was Naomi.
`;

const result = await control('POST', `/projects/${TARGET_PTID}/commit`, {
  bookCode: 'RUT',
  usfm: edited,
  message: 'Editor changed Ruth 1:1 in Paratext',
  user: 'Mock Translator'
});
console.log('committed Paratext-side edit; new server tip:', result.tipId);
console.log('now sync the target project (MTRG) in Scripture Forge to pull the change.');
