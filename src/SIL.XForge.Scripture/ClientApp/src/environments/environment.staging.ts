import merge from 'lodash/merge';
import { production } from './environment.defaults';

export const environment = merge(production, {
  releaseStage: 'qa',
  authDomain: 'dev-sillsdev.auth0.com',
  authClientId: '4eHLjo40mAEGFU6zUxdYjnpnC1K1Ydnj'
});
