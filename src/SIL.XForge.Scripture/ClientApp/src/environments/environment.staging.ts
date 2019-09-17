import { production } from './environment.defaults';

export const environment = Object.assign(production, {
  releaseStage: 'qa',
  authDomain: 'dev-sillsdev.auth0.com',
  authClientId: '4eHLjo40mAEGFU6zUxdYjnpnC1K1Ydnj'
});
