#!/usr/bin/env -S deno run --allow-net --allow-env=AUTH0_TOKEN

const usage: string = `Usage:
At present, this script only interacts with the development Auth0 tenant.

First: export AUTH0_TOKEN="eyAbCd..."
Your Auth0 authorization bearer token can be found in the Auth0 Dashboard at
Applications - APIs - Auth0 Management API - API Explorer - Token.

Unlink auth0 accounts:
  ./auth0-manage.ts unlink --unlinkSecondaryUserId 'paratext|ABCABC' --fromPrimaryUserId 'auth0|12341234' --provider 'oauth2'

Delete auth0 account:
  ./auth0-manage.ts delete --userId 'oauth2|paratext|ABCABC'

Fetch tenant log entries in a time period. They are printed as JSON on stdout. Progress is written to stderr.
  ./auth0-manage.ts fetchLogs --from 2025-12-31T12:34:56Z --to 2026-12-31T12:34:56Z > logs.json
`;

import { parser } from 'https://deno.land/x/args_command_parser@v1.2.4/mod.js';

/** An entry in the Auth0 tenant log. */
interface Auth0LogEntry {
  log_id: string;
  date: string;
  // Entries carry many more fields than the above.
  [field: string]: unknown;
}

class Program {
  private args: any = parser().data;
  private authorizationBearerToken: string | undefined = undefined;

  fail(reason: string): never {
    console.log(`Error: ${reason}`);
    this.usage();
    Deno.exit(1);
  }

  usage() {
    console.log(usage);
    Deno.exit(100);
  }

  async unlink() {
    const fromPrimaryUserId =
      this.args.longSwitches['fromPrimaryUserId'] ?? this.fail("specify --fromPrimaryUserId, such as 'auth0|12341234'");
    const unlinkSecondaryUserId =
      this.args.longSwitches['unlinkSecondaryUserId'] ??
      this.fail("specify account id to unlink as --unlinkSecondaryUserId, such as 'paratext|ABCABCABC'");
    const provider =
      this.args.longSwitches['provider'] ??
      this.fail('specify secondary user account provider as --provider, such as oauth2 or google-oauth2');

    // API https://auth0.com/docs/api/management/v2#!/Users/delete_user_identity_by_user_id
    const response = await fetch(
      `https://sil-appbuilder.auth0.com/api/v2/users/${fromPrimaryUserId}/identities/${provider}/${unlinkSecondaryUserId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.authorizationBearerToken}` }
      }
    );
    console.log(response);
  }

  async delete() {
    const userId =
      this.args.longSwitches['userId'] ?? this.fail("specify --userId to delete, such as 'oauth2|paratext|ABCABC'");

    // API https://auth0.com/docs/api/management/v2#!/Users/delete_users_by_id
    const response = await fetch(`https://sil-appbuilder.auth0.com/api/v2/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.authorizationBearerToken}` }
    });
    console.log(response);
  }

  /** Requests log entries. */
  private async getLogs(query: URLSearchParams): Promise<Auth0LogEntry[]> {
    const url: string = `https://sil-appbuilder.auth0.com/api/v2/logs?${query.toString().replaceAll('+', '%20')}`;
    // API https://auth0.com/docs/api/management/v2#!/Logs/get_logs
    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.authorizationBearerToken}` }
    });
    if (response.status === 429) {
      this.fail(`Auth0 is rate limiting the request. ${await response.text()}`);
    }
    if (!response.ok) {
      this.fail(`Auth0 returned ${response.status} ${response.statusText} for ${url}: ${await response.text()}`);
    }
    const entries: Auth0LogEntry[] = await response.json();
    return entries;
  }

  /**
   * Writes every log entry in a time window to stdout, as a JSON array.
   *
   * Auth0 returns at most 100 entries per request. Using the first log in the time period, fetch 100 records at a time
   * until we reach the end of the time period.
   */
  async fetchLogs(): Promise<void> {
    const from: string = this.args.longSwitches['from'] ?? this.fail("specify --from, such as '2025-12-25T23:59:59Z'");
    const to: string = this.args.longSwitches['to'] ?? this.fail("specify --to, such as '2025-12-31T23:59:59Z'");
    const toTime: number = Date.parse(to);
    if (Number.isNaN(Date.parse(from))) this.fail(`--from is not a date: ${from}`);
    if (Number.isNaN(toTime)) this.fail(`--to is not a date: ${to}`);

    const firstInWindow: Auth0LogEntry[] = await this.getLogs(
      new URLSearchParams({ q: `date:[${from} TO ${to}]`, sort: 'date:1', per_page: '1', page: '0' })
    );
    if (firstInWindow.length === 0) {
      console.error('No log entries in that window.');
      console.log('[]');
      return;
    }

    const entries: Auth0LogEntry[] = [firstInWindow[0]];
    let lastLogId: string = firstInWindow[0].log_id;
    while (true) {
      const page: Auth0LogEntry[] = await this.getLogs(new URLSearchParams({ from: lastLogId, take: '100' }));
      if (page.length === 0) break;
      lastLogId = page[page.length - 1].log_id;

      // Logs are not guaranteed to be in chronological order. And are observed to arrive up to a fraction of a second
      // out of date order. So take every entry in a page rather than stopping at the first one past the requested date
      // range, and read on until a whole page lies beyond the window.
      const inWindow: Auth0LogEntry[] = page.filter(entry => Date.parse(entry.date) <= toTime);
      entries.push(...inWindow);
      if (inWindow.length === 0) break;

      console.error(`Fetched ${entries.length} entries, through ${entries[entries.length - 1].date}`);
    }

    console.log(JSON.stringify(entries, null, 2));
  }

  async main() {
    if (this.args.longSwitches['help'] != null) {
      this.usage();
    }

    this.authorizationBearerToken =
      Deno.env.get('AUTH0_TOKEN') ??
      this.fail(
        'specify auth0 authorization bearer token in environment variable, such as export AUTH0_TOKEN="eyAbCd..."'
      );

    if (this.args.commands.includes('unlink')) {
      await this.unlink();
    } else if (this.args.commands.includes('delete')) {
      await this.delete();
    } else if (this.args.commands.includes('fetchLogs')) {
      await this.fetchLogs();
    } else {
      console.log('No command specified.');
      this.usage();
    }
  }
}

await new Program().main();
