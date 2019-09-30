module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testResultsProcessor: 'jest-teamcity-reporter',
  setupFilesAfterEnv: ['jest-expect-message']
};
