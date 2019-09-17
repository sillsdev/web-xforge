import merge from 'lodash/merge';
import { production } from './environment.defaults';

export const environment = merge(production, {
  releaseStage: 'live',
  authDomain: 'login.languagetechnology.org',
  authClientId: 'tY2wXn40fsL5VsPM4uIHNtU6ZUEXGeFn'
});
