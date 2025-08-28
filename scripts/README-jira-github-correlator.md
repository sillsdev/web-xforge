# Jira-GitHub Correlator Script

This Deno TypeScript script correlates GitHub pull requests with Jira issues for the Scripture Forge project. It helps identify mismatches between Jira issue statuses and GitHub PR states/labels.

## Prerequisites

1. **Deno**: Install Deno from [deno.land](https://deno.land/)
2. **Jira Personal Access Token**: Create a personal access token in Jira
3. **GitHub Personal Access Token**: Create a personal access token in GitHub (optional but recommended for accurate review status)

## Setup

1. **Get a Jira Personal Access Token:**

   - Go to https://jira.sil.org
   - Navigate to your profile settings
   - Create a personal access token
   - Copy the token

2. **Set Environment Variables:**
   ```bash
   export JIRA_ACCESS_TOKEN="your_jira_token_here"
   export GITHUB_AUTH_TOKEN="your_github_token_here"  # Optional but recommended
   ```

## Usage

Run the script from the `scripts` directory:

```bash
cd scripts
deno run --allow-net --allow-env jira-github-correlator.ts
```

## What it does

The script:

1. **Fetches Jira Issues** from these categories:

   - In Progress
   - Code Review
   - Ready for Testing
   - Test Complete (Resolved with fixVersion="next")
   - Done (Closed with fixVersion="next")

2. **Fetches GitHub Pull Requests** from the sillsdev/web-xforge repository

3. **Correlates Issues and PRs** by extracting Jira issue keys (e.g., SF-3529) from PR titles

4. **Identifies Mismatches** such as:

   - Jira issues in "Code Review" without corresponding PRs
   - Jira issues "Ready for Testing" but no "ready to test" labeled PRs
   - PRs labeled "ready to test" but Jira issues not in appropriate status
   - Closed PRs that were ready for testing but Jira issues not updated

5. **Reports:**
   - List of all fetched Jira issues by status
   - List of GitHub PRs with relevant labels
   - Mismatches found
   - PRs without Jira issue references
   - Successful correlations
   - Summary statistics

## Expected PR Labels

The script looks for these GitHub PR labels:

- `Testing not required`
- `ready to test`
- `will require testing`

## Output

The script provides detailed output including:

- All Jira issues organized by status
- GitHub PRs filtered by relevant labels
- Correlation analysis with mismatch detection
- Summary statistics
- **Clickable links**: Jira issue keys and GitHub PR numbers are clickable hyperlinks (OSC 8 format) that open directly in your browser

## Example Mismatches

- 🚨 **Missing PR**: Jira issue [SF-3180](https://jira.sil.org/browse/SF-3180) is in "Code Review" but no PR found
- 🚨 **Status Mismatch**: PR [#3404](https://github.com/sillsdev/web-xforge/pull/3404) is labeled "ready to test" but Jira issue [SF-3531](https://jira.sil.org/browse/SF-3531) is "In Progress"

Note: In the actual terminal output, these will appear as clickable hyperlinks.

## Troubleshooting

- **401 Unauthorized**: Check your JIRA_ACCESS_TOKEN is set correctly
- **403 Forbidden**: Verify your Jira token has sufficient permissions
- **Network errors**: Check your internet connection and firewall settings
