#!/usr/bin/env -S deno run --allow-net --allow-env

// Checks a PR's labels and posts a commit status to GitHub. Invoked by check-pr-labels.yml on
// pull_request_target events. The status stays "pending" until the PR has the required labels,
// keeping the merge button blocked without showing a red workflow failure.

const token: string | undefined = Deno.env.get('GITHUB_TOKEN');
const sha: string | undefined = Deno.env.get('SHA');
const repo: string | undefined = Deno.env.get('REPO');
const labelsJson: string | undefined = Deno.env.get('LABELS_JSON');

if (token == null || sha == null || repo == null || labelsJson == null) {
  console.error('GITHUB_TOKEN, SHA, REPO, and LABELS_JSON environment variables are required');
  Deno.exit(1);
}

const labels: string[] = JSON.parse(labelsJson);

const hasTestingComplete: boolean = labels.includes('testing complete');
const hasTestingNotRequired: boolean = labels.includes('testing not required');
const hasDoNotMerge: boolean = labels.includes('do not merge');

type CommitState = 'pending' | 'success';

let state: CommitState;
let description: string;

if (hasDoNotMerge) {
  state = 'pending';
  description = "Remove the 'do not merge' label before merging";
} else if (hasTestingComplete || hasTestingNotRequired) {
  state = 'success';
  description = 'PR is ready to merge';
} else {
  state = 'pending';
  description = "Add 'testing complete' or 'testing not required' label before merging";
}

const response = await fetch(`https://api.github.com/repos/${repo}/statuses/${sha}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json'
  },
  body: JSON.stringify({ state, description, context: 'Merge readiness' })
});

if (!response.ok) {
  const body: string = await response.text();
  console.error(`GitHub API request failed with status ${response.status}: ${response.statusText}`);
  console.error(`Response body: ${body}`);
  Deno.exit(1);
}

console.log(`Set commit status to '${state}': ${description}`);
