// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --prod` then `environment.prod.ts` will be used instead. And if you do
// `ng build --configuration=pwaTest` then `environment.pwa-test.ts` will be used instead.
// The list of which env maps to which file can be found in `angular.json`.

export const environment = {
  production: false,
  pwaTest: false,
  issueEmail: 'issues@scriptureforge.org',
  siteName: 'Scripture Forge',
  realtimePort: 5003,
  realtimeUrl: '/',
  authDomain: 'sil-appbuilder.auth0.com',
  authClientId: 'aoAGb9Yx1H5WIsvCW6JJCteJhSa37ftH',
  audience: 'https://scriptureforge.org/',
  scope: 'sf_data',
  prefix: 'sf',
  siteId: 'sf',
  assets: {
    audio: '/assets/audio/'
  }
};
