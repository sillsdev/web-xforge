import bugsnag from '@bugsnag/js';

export class ExceptionReporter {
  private readonly bugsnagClient: any;

  constructor(bugsnagApiKey: string, releaseStage: string, version: string) {
    this.bugsnagClient = bugsnag({
      apiKey: bugsnagApiKey,
      appVersion: version,
      appType: 'node',
      notifyReleaseStages: ['live', 'qa'],
      releaseStage: releaseStage,
      autoNotify: false
    });
  }

  report(error: any) {
    this.bugsnagClient.notify(error);
  }
}
