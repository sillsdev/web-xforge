import merge from 'lodash/merge';
import { development } from './environment.defaults';

export const environment = merge(development, { pwaTest: true });
