// Mock environment: pairs with SF_MOCK_SERVICES=true / appsettings.Mock.json and src/MockServices.
// Use `npm run start:mock` (ng serve --configuration=mock) to run the frontend against the local
// fake Auth0 and other mock services defined in src/MockServices.

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
  helps: 'https://help.scriptureforge.org',
  bugsnagApiKey: 'b72a46a8924a3cd161d4c5534287923c',
  realtimePort: 5003,
  realtimeSecurePort: 5005,
  realtimeUrl: '/',
  authDomain: 'http://localhost:5100/auth0',
  authClientId: 'sf-mock-frontend-client',
  offlineDBVersion: 8
};
