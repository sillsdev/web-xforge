#!./node_modules/.bin/ts-node

import axios from 'axios';
import { showJwt } from './show-jwt';

const AUTH0_MANAGEMENT_API_ACCESS_TOKEN = '';
const authDomain = '';
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
