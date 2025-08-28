#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script to correlate GitHub pull requests with Jira issues
 * Fetches data from both sources and identifies mismatches in status
 *
 * Usage:
 *   1. Set JIRA_ACCESS_TOKEN environment variable with your Jira personal access token
 *   2. Set GITHUB_AUTH_TOKEN environment variable with your GitHub personal access token (optional but recommended)
 *   3. Run: deno run --allow-net --allow-env jira-github-correlator.ts
 *
 * The script will:
 *   - Fetch Jira issues in various states (In Progress, Code Review, Ready for Testing, etc.)
 *   - Fetch GitHub pull requests from the web-xforge repository
 *   - Correlate them by extracting Jira issue keys from PR titles
 *   - Identify mismatches between Jira status and PR state/labels
 *   - Report PRs without Jira issue references
 *   - Show successful correlations
 */

export {}; // Make this a module

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee?: string;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  labels: string[];
  html_url: string;
  user: {
    login: string;
  };
  hasApprovingReview?: boolean;
  hasRequestedChanges?: boolean;
}

interface JiraSearchResult {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      status: {
        name: string;
      };
      assignee?: {
        displayName: string;
      };
    };
  }>;
  total: number;
}

class JiraGitHubCorrelator {
  private readonly jiraBaseUrl = 'https://jira.sil.org';
  private readonly jiraApiRoot = `${this.jiraBaseUrl}/rest/api/2`;
  private readonly githubBaseUrl = 'https://api.github.com';
  private readonly repo = 'sillsdev/web-xforge';
  // @ts-ignore: Deno global
  private readonly jiraPersonalAccessToken = Deno.env.get('JIRA_ACCESS_TOKEN');
  // @ts-ignore: Deno global
  private readonly githubAuthToken = Deno.env.get('GITHUB_AUTH_TOKEN');

  // Jira JQL queries for different statuses
  private readonly jiraQueries = {
    'In Progress': 'project = SF AND status = "In Progress"',
    'Code Review': 'project = SF AND status = "Code Review"',
    'Ready for Testing': 'project = SF AND status = "Ready for Testing"',
    'Test Complete': 'project = SF AND status = Resolved AND fixVersion = "next"',
    Done: 'project = SF AND status = Closed AND fixVersion = "next"'
  };

  private async fetchJiraIssues(status: string): Promise<JiraIssue[]> {
    const jql = this.jiraQueries[status as keyof typeof this.jiraQueries];
    if (!jql) {
      throw new Error(`Unknown status: ${status}`);
    }

    if (!this.jiraPersonalAccessToken) {
      throw new Error('JIRA_ACCESS_TOKEN environment variable not set');
    }

    const url = `${this.jiraApiRoot}/search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jiraPersonalAccessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Jira API request failed: ${response.status} ${response.statusText}\n${await response.text()}`);
      }

      const data: JiraSearchResult = await response.json();

      return data.issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName
      }));
    } catch (error) {
      console.error(`Error fetching Jira issues for ${status}:`, error);
      return [];
    }
  }

  private async fetchAllJiraIssues(): Promise<Map<string, JiraIssue[]>> {
    const results = new Map<string, JiraIssue[]>();

    for (const status of Object.keys(this.jiraQueries)) {
      const issues = await this.fetchJiraIssues(status);
      results.set(status, issues);
    }

    return results;
  }

  private async fetchGitHubPullRequests(): Promise<GitHubPullRequest[]> {
    const url = `${this.githubBaseUrl}/repos/${this.repo}/pulls?state=all&per_page=100`;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json'
      };

      if (this.githubAuthToken) {
        headers.Authorization = `Bearer ${this.githubAuthToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `GitHub API request failed: ${response.status} ${response.statusText}\n${await response.text()}`
        );
      }

      const data = await response.json();

      const prs: GitHubPullRequest[] = data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        labels: pr.labels.map((label: any) => label.name),
        html_url: pr.html_url,
        user: {
          login: pr.user.login
        }
      }));

      // Fetch review status for open PRs
      for (const pr of prs) {
        if (pr.state === 'open') {
          const reviewStatus = await this.fetchPRReviewStatus(pr.number);
          pr.hasApprovingReview = reviewStatus.hasApprovingReview;
          pr.hasRequestedChanges = reviewStatus.hasRequestedChanges;
        }
      }

      return prs;
    } catch (error) {
      console.error('Error fetching GitHub pull requests:', error);
      return [];
    }
  }

  private async fetchPRReviewStatus(
    prNumber: number
  ): Promise<{ hasApprovingReview: boolean; hasRequestedChanges: boolean }> {
    const url = `${this.githubBaseUrl}/repos/${this.repo}/pulls/${prNumber}/reviews`;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json'
      };

      if (this.githubAuthToken) {
        headers.Authorization = `Bearer ${this.githubAuthToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `GitHub API request failed: ${response.status} ${response.statusText}\n${await response.text()}`
        );
      }

      const reviews = await response.json();

      // Get the latest meaningful review from each reviewer
      // Only APPROVED, CHANGES_REQUESTED, and DISMISSED affect approval status
      const latestReviews = new Map<string, any>();
      for (const review of reviews) {
        if (review.user && review.state !== 'DISMISSED') {
          const userId = review.user.login;
          const currentLatest = latestReviews.get(userId);

          // Only update if this review affects approval status, or if we don't have any review yet
          if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
            if (!currentLatest || new Date(review.submitted_at) > new Date(currentLatest.submitted_at)) {
              latestReviews.set(userId, review);
            }
          } else if (!currentLatest) {
            // If we don't have any meaningful review yet, store this COMMENTED review as a placeholder
            latestReviews.set(userId, review);
          }
        }
      }

      let hasApprovingReview = false;
      let hasOutstandingChangeRequests = false;

      // Check the latest meaningful review state from each reviewer
      for (const review of latestReviews.values()) {
        if (review.state === 'APPROVED') {
          hasApprovingReview = true;
        } else if (review.state === 'CHANGES_REQUESTED') {
          hasOutstandingChangeRequests = true;
        }
        // Note: 'COMMENTED' reviews don't affect approval status
      }

      // A PR is considered approved if:
      // 1. It has at least one approval, AND
      // 2. No reviewers currently have outstanding change requests
      const isApproved = hasApprovingReview && !hasOutstandingChangeRequests;

      return { hasApprovingReview: isApproved, hasRequestedChanges: hasOutstandingChangeRequests };
    } catch (error) {
      console.error(`Error fetching reviews for PR #${prNumber}:`, error);
      return { hasApprovingReview: false, hasRequestedChanges: false };
    }
  }

  private printJiraIssues(issuesByStatus: Map<string, JiraIssue[]>) {
    console.log('\n=== JIRA ISSUES SUMMARY ===');

    for (const [status, issues] of issuesByStatus) {
      console.log(`${status}: ${issues.length} issues`);
    }
  }

  private printGitHubPullRequests(pullRequests: GitHubPullRequest[]) {
    console.log('\n=== GITHUB PULL REQUESTS SUMMARY ===');

    const relevantLabels = ['Testing not required', 'ready to test', 'will require testing'];
    const prsWithRelevantLabels = pullRequests.filter(pr => pr.labels.some(label => relevantLabels.includes(label)));

    console.log(`PRs with testing labels: ${prsWithRelevantLabels.length}`);
  }

  private extractJiraKeyFromText(text: string): string | null {
    const jiraKeyMatch = text.match(/SF-\d+/);
    return jiraKeyMatch ? jiraKeyMatch[0] : null;
  }

  private createJiraHyperlink(jiraKey: string): string {
    const url = `${this.jiraBaseUrl}/browse/${jiraKey}`;
    // OSC 8 hyperlink format: \e]8;;URL\e\\TEXT\e]8;;\e\\
    return `\x1b]8;;${url}\x1b\\${jiraKey}\x1b]8;;\x1b\\`;
  }

  private createGitHubPRHyperlink(prNumber: number): string {
    const url = `https://github.com/${this.repo}/pull/${prNumber}`;
    return `\x1b]8;;${url}\x1b\\#${prNumber}\x1b]8;;\x1b\\`;
  }

  private getExpectedJiraStatus(pr: GitHubPullRequest): string[] {
    // Determine what Jira status(es) would be appropriate for this PR

    if (pr.state === 'closed') {
      return ['Test Complete', 'Closed'];
    }

    // For open PRs
    if (pr.hasApprovingReview && !pr.hasRequestedChanges) {
      // Approved PRs should always be ready for testing
      return ['Ready for Testing'];
    }

    if (pr.labels.includes('ready to test')) {
      return ['Ready for Testing'];
    }

    if (pr.labels.includes('Testing not required')) {
      return ['Ready for Testing', 'Test Complete', 'Closed'];
    }

    if (pr.labels.includes('will require testing')) {
      return ['In Progress', 'Code Review'];
    }

    // Default for open PRs without specific labels
    return ['In Progress', 'Code Review'];
  }

  private getExpectedPRState(jiraIssue: JiraIssue): {
    shouldBeOpen: boolean;
    shouldHaveLabel?: string;
    shouldBeApproved?: boolean;
  } {
    // Determine what PR state would be appropriate for this Jira status

    switch (jiraIssue.status) {
      case 'In Progress':
        return { shouldBeOpen: true };

      case 'Code Review':
        return { shouldBeOpen: true, shouldHaveLabel: 'will require testing' };

      case 'Ready for Testing':
        return {
          shouldBeOpen: true,
          shouldHaveLabel: 'ready to test',
          shouldBeApproved: true
        };

      case 'Test Complete':
      case 'Closed':
        return { shouldBeOpen: false };

      default:
        return { shouldBeOpen: true };
    }
  }

  private correlateIssuesAndPRs(jiraIssues: Map<string, JiraIssue[]>, githubPRs: GitHubPullRequest[]) {
    // Create a flat map of all Jira issues
    const allJiraIssues = new Map<string, JiraIssue>();
    for (const [status, issues] of jiraIssues) {
      for (const issue of issues) {
        allJiraIssues.set(issue.key, issue);
      }
    }

    // Create a map of PRs by their Jira issue key
    const prsByJiraKey = new Map<string, GitHubPullRequest[]>();
    const prsWithoutJiraKey: GitHubPullRequest[] = [];

    for (const pr of githubPRs) {
      const jiraKey = this.extractJiraKeyFromText(pr.title);
      if (jiraKey) {
        if (!prsByJiraKey.has(jiraKey)) {
          prsByJiraKey.set(jiraKey, []);
        }
        prsByJiraKey.get(jiraKey)!.push(pr);
      } else {
        prsWithoutJiraKey.push(pr);
      }
    }

    // Analyze mismatches using simplified logic
    const mismatches: Array<{
      type: string;
      jiraKey?: string;
      jiraStatus?: string;
      prNumber?: number;
      prState?: string;
      prLabels?: string[];
      description: string;
    }> = [];

    // Check each Jira issue against its PRs
    for (const [jiraKey, jiraIssue] of allJiraIssues) {
      const relatedPRs = prsByJiraKey.get(jiraKey) || [];

      // Missing PR check
      if ((jiraIssue.status === 'Code Review' || jiraIssue.status === 'Ready for Testing') && relatedPRs.length === 0) {
        mismatches.push({
          type: 'Missing PR',
          jiraKey,
          jiraStatus: jiraIssue.status,
          description: `Jira issue ${jiraKey} is "${jiraIssue.status}" but no PR found`
        });
        continue;
      }

      // Check each PR against the Jira issue
      for (const pr of relatedPRs) {
        const expectedJiraStatuses = this.getExpectedJiraStatus(pr);

        if (!expectedJiraStatuses.includes(jiraIssue.status)) {
          mismatches.push({
            type: 'Status Mismatch',
            jiraKey,
            jiraStatus: jiraIssue.status,
            prNumber: pr.number,
            prState: pr.state,
            prLabels: pr.labels,
            description: `PR #${pr.number} (${this.describePR(
              pr
            )}) suggests Jira ${jiraKey} should be "${expectedJiraStatuses.join(' or ')}" but it's "${
              jiraIssue.status
            }"`
          });
        }
      }
    }

    // Check PRs against their expected Jira status
    for (const [jiraKey, prs] of prsByJiraKey) {
      const jiraIssue = allJiraIssues.get(jiraKey);
      if (!jiraIssue) continue;

      const expectedPRState = this.getExpectedPRState(jiraIssue);

      for (const pr of prs) {
        // Check if PR state matches expectations
        if (expectedPRState.shouldBeOpen && pr.state === 'closed') {
          mismatches.push({
            type: 'Status Mismatch',
            jiraKey,
            jiraStatus: jiraIssue.status,
            prNumber: pr.number,
            prState: pr.state,
            description: `Jira ${jiraKey} is "${jiraIssue.status}" but PR #${pr.number} is closed`
          });
        }

        if (!expectedPRState.shouldBeOpen && pr.state === 'open') {
          mismatches.push({
            type: 'Status Mismatch',
            jiraKey,
            jiraStatus: jiraIssue.status,
            prNumber: pr.number,
            prState: pr.state,
            description: `Jira ${jiraKey} is "${jiraIssue.status}" but PR #${pr.number} is still open`
          });
        }

        // Check if PR should be approved but isn't
        if (expectedPRState.shouldBeApproved && pr.state === 'open' && !pr.hasApprovingReview) {
          mismatches.push({
            type: 'Missing Approval',
            jiraKey,
            jiraStatus: jiraIssue.status,
            prNumber: pr.number,
            description: `Jira ${jiraKey} is "Ready for Testing" but PR #${pr.number} lacks approval`
          });
        }
      }
    }

    return { mismatches, prsWithoutJiraKey, prsByJiraKey, allJiraIssues };
  }

  private describePR(pr: GitHubPullRequest): string {
    const parts: string[] = [];

    if (pr.state === 'closed') {
      parts.push('closed');
    } else {
      if (pr.hasApprovingReview) parts.push('approved');
      if (pr.hasRequestedChanges) parts.push('changes requested');

      const relevantLabels = pr.labels.filter(label =>
        ['ready to test', 'will require testing', 'Testing not required'].includes(label)
      );
      if (relevantLabels.length > 0) {
        parts.push(`labeled: ${relevantLabels.join(', ')}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'open';
  }

  private printCorrelationResults(
    mismatches: Array<{
      type: string;
      jiraKey?: string;
      jiraStatus?: string;
      prNumber?: number;
      prState?: string;
      prLabels?: string[];
      description: string;
    }>,
    prsWithoutJiraKey: GitHubPullRequest[],
    prsByJiraKey: Map<string, GitHubPullRequest[]>,
    allJiraIssues: Map<string, JiraIssue>
  ) {
    console.log('\n=== ISSUES FOUND ===');

    if (mismatches.length === 0) {
      console.log('✅ No status mismatches detected!');
    } else {
      console.log(`🚨 ${mismatches.length} mismatch(es) found:`);
      for (const mismatch of mismatches) {
        let description = mismatch.description;

        // Replace Jira issue keys with hyperlinks
        if (mismatch.jiraKey) {
          const hyperlink = this.createJiraHyperlink(mismatch.jiraKey);
          description = description.replace(mismatch.jiraKey, hyperlink);
        }

        // Replace PR numbers with hyperlinks
        if (mismatch.prNumber) {
          const prHyperlink = this.createGitHubPRHyperlink(mismatch.prNumber);
          description = description.replace(`#${mismatch.prNumber}`, prHyperlink);
        }

        console.log(`   • ${description}`);
      }
    }

    const relevantPRsWithoutKeys = prsWithoutJiraKey.filter(pr =>
      pr.labels.some(label => ['Testing not required', 'ready to test', 'will require testing'].includes(label))
    );

    if (relevantPRsWithoutKeys.length > 0) {
      console.log(`\n📝 ${relevantPRsWithoutKeys.length} PR(s) with testing labels but no Jira reference:`);
      for (const pr of relevantPRsWithoutKeys) {
        // Check if there's a Jira key hidden in the title and make it clickable
        const jiraKey = this.extractJiraKeyFromText(pr.title);
        let title = pr.title;
        if (jiraKey) {
          const hyperlink = this.createJiraHyperlink(jiraKey);
          title = title.replace(jiraKey, hyperlink);
        }

        // Make PR number clickable
        const prHyperlink = this.createGitHubPRHyperlink(pr.number);
        console.log(`   • ${prHyperlink}: ${title}`);
      }
    }
  }

  async run() {
    console.log('🔍 Fetching data and analyzing correlations...\n');

    if (!this.githubAuthToken) {
      console.warn('⚠️  GITHUB_AUTH_TOKEN not set. Review status may be incomplete.\n');
    }

    try {
      // Fetch data from both sources
      const jiraIssues = await this.fetchAllJiraIssues();
      const githubPRs = await this.fetchGitHubPullRequests();

      // Print brief summaries
      this.printJiraIssues(jiraIssues);
      this.printGitHubPullRequests(githubPRs);

      // Perform correlation analysis
      const { mismatches, prsWithoutJiraKey, prsByJiraKey, allJiraIssues } = this.correlateIssuesAndPRs(
        jiraIssues,
        githubPRs
      );

      // Print correlation results
      this.printCorrelationResults(mismatches, prsWithoutJiraKey, prsByJiraKey, allJiraIssues);
    } catch (error) {
      console.error('❌ Script execution failed:', error);
      // @ts-ignore: Deno global
      Deno.exit(1);
    }
  }
}

// Run the script
// @ts-ignore: Deno import.meta.main
if (import.meta.main) {
  const correlator = new JiraGitHubCorrelator();
  await correlator.run();
}
