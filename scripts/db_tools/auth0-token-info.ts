#!./node_modules/.bin/ts-node

import axios from 'axios';
import { showJwt } from './show-jwt';

// This script uses the Auth0 Management API to search for a user by email address and print out the Paratext access
// token for that user. It can be run by itself, or the token can be monitored by running e.g.
// watch -n 10 ./auth0-token-info.ts
// which will run the script every 10 seconds.

// See https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens#get-management-api-tokens for
// instructions regarding creating or revoking Auth0 Management API tokens
const AUTH0_MANAGEMENT_API_ACCESS_TOKEN = '';
// Set the authDomain to the domain users log in at, which varies depending on which tenant is being connected to.
// Often this is a subdomain of auth0.com.
const authDomain = '';
// This script searches for users by email address and picks the first result. Change this to the email of the user to
// fetch.
const userEmail = '';

var options = {
  method: 'GET',
  url: `https://${authDomain}/api/v2/users`,
  params: { q: `email:"${userEmail}"`, search_engine: 'v3' },
  headers: { authorization: `Bearer ${AUTH0_MANAGEMENT_API_ACCESS_TOKEN}` }
};

async function run() {
  try {
    const response = await axios.request(options);
    const user = response.data[0];
    const ids = user.identities;
    const ptIdentity = ids.find((id: any) => id.connection == 'paratext');
    const jwt = ptIdentity.access_token;
    showJwt(jwt);
  } catch (error) {
    console.error(error);
  }
}

run();
