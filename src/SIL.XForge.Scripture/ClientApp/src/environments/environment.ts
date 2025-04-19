// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --prod` then `environment.prod.ts` will be used instead. And if you do
// `ng build --configuration=pwaTest` then `environment.pwa-test.ts` will be used instead.
// The list of which env maps to which file can be found in `angular.json`.
// The environment object should not be generated dynamically. This seems to cause problems with production builds.

export const environment = {
  releaseStage: 'dev',
  pwaTest: false,
  production: false,
  masterUrl: 'http://localhost:5000',
  issueEmail: 'help@scriptureforge.org',
  siteName: 'Scripture Forge',
  audience: 'https://scriptureforge.org/',
  scope: 'sf_data',
  siteId: 'sf',
  assets: '/assets/',
  helps: 'https://github-action-preview--scriptureforgehelp.netlify.app',
  bugsnagApiKey: 'b72a46a8924a3cd161d4c5534287923c',
  realtimePort: 5003,
  realtimeSecurePort: 5005,
  realtimeUrl: '/',
  authDomain: 'sil-appbuilder.auth0.com',
  authClientId: 'aoAGb9Yx1H5WIsvCW6JJCteJhSa37ftH',
  offlineDBVersion: 8,
  googleTagManagerId: 'GTM-P2DF8SLM',
  googleTagManagerAuth: 'AC1M72Jw4UydK-bnFoT0Cw',
  googleTagManagerPreview: 'env-8'
};
