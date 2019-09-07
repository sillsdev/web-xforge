import { clone, merge } from 'lodash';

const defaults = {
  pwaTest: false,
  issueEmail: 'scriptureforgeissues@sil.org',
  siteName: 'Scripture Forge',
  audience: 'https://scriptureforge.org/',
  scope: 'sf_data',
  siteId: 'sf',
  assets: {
    audio: '/assets/audio/'
  },
  helps: 'https://help.scriptureforge.org/#t=Overview/Getting_Started.htm',
  bugsnagApiKey: 'b72a46a8924a3cd161d4c5534287923c'
};

const production = merge(clone(defaults), {
  production: true,
  realtimePort: undefined as number,
  realtimeUrl: '/realtime-api/'
});

const development = merge(clone(defaults), {
  production: false,
  realtimePort: 5003,
  realtimeUrl: '/',
  authDomain: 'sil-appbuilder.auth0.com',
  authClientId: 'aoAGb9Yx1H5WIsvCW6JJCteJhSa37ftH',
  releaseStage: 'dev'
});

export { production, development };
