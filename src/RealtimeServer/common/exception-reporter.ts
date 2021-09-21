import Bugsnag, { Client, NotifiableError } from '@bugsnag/js';

export class ExceptionReporter {
  private readonly bugsnagClient: Client;

  constructor(bugsnagApiKey: string, releaseStage: string, version: string) {
    this.bugsnagClient = Bugsnag.createClient({
      apiKey: bugsnagApiKey,
      appVersion: version,
      appType: 'node',
      enabledReleaseStages: ['live', 'qa'],
      releaseStage: releaseStage,
      autoDetectErrors: false
    });
  }

  report(error: NotifiableError): void {
    this.bugsnagClient.notify(error);
  }
}
