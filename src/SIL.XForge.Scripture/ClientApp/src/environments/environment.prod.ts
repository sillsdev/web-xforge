import { production } from './environment.defaults';

export const environment = Object.assign(production, {
  releaseStage: 'live',
  authDomain: 'login.languagetechnology.org',
  authClientId: 'tY2wXn40fsL5VsPM4uIHNtU6ZUEXGeFn'
});
