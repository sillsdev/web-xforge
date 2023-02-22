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
`;

import { parser } from 'https://deno.land/x/args_command_parser@v1.2.4/mod.js';

class Program {
  private args: any = parser().data;
  private authorizationBearerToken: string | undefined = undefined;

  fail(reason: string): void {
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
      this.unlink();
    } else if (this.args.commands.includes('delete')) {
      this.delete();
    } else {
      console.log('No command specified.');
      this.usage();
    }
  }
}

await new Program().main();
