import { HttpClientTestingModule } from '@angular/common/http/testing';
import { fakeAsync, flush, TestBed } from '@angular/core/testing';
import { mock, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode, CommandService } from 'xforge-common/command.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { PROJECTS_URL } from 'xforge-common/url-constants';
import { FeatureFlagService } from './feature-flag.service';

const mockedCommandService = mock(CommandService);

describe('FeatureFlagService', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule],
    providers: [{ provide: CommandService, useMock: mockedCommandService }]
  }));

  it('sets and gets the enabled property', fakeAsync(() => {
    const env = new TestEnvironment();
    env.service.preventOpAcknowledgement.enabled = true;
    expect(env.service.preventOpAcknowledgement.enabled).toBeTruthy();

    // Clean up
    env.service.preventOpAcknowledgement.enabled = false;
  }));

  it('the enabled property defaults to false', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
  }));

  it('loads remote feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    // The first call loads the remote feature flags
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    flush();
    expect(env.service.preventOpSubmission.enabled).toBeTruthy();
    verify(mockedCommandService.onlineInvoke(PROJECTS_URL, 'featureFlags')).once();
  }));

  it('undefined remote feature flags default to false', fakeAsync(() => {
    const env = new TestEnvironment();
    // The first call loads the remote feature flags
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    flush();
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    verify(mockedCommandService.onlineInvoke(PROJECTS_URL, 'featureFlags')).once();
  }));

  it('remote feature flags are read only', fakeAsync(() => {
    const env = new TestEnvironment();
    // The first call loads the remote feature flags
    expect(env.service.showNonPublishedLocalizations.enabled).toBeFalsy();
    flush();
    expect(env.service.showNonPublishedLocalizations.readonly).toBeTruthy();
    verify(mockedCommandService.onlineInvoke(PROJECTS_URL, 'featureFlags')).once();
  }));

  it('does not throw errors when retrieving remote feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedCommandService.onlineInvoke<{ [key: string]: boolean }>(PROJECTS_URL, 'featureFlags')).thenReject(
      new CommandError(CommandErrorCode.InternalError, 'unknown error')
    );
    // The first call loads the remote feature flags
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    flush();
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    verify(mockedCommandService.onlineInvoke(PROJECTS_URL, 'featureFlags')).once();
  }));
});

class TestEnvironment {
  readonly service: FeatureFlagService;

  constructor() {
    this.service = TestBed.inject(FeatureFlagService);
    when(mockedCommandService.onlineInvoke<{ [key: string]: boolean }>(PROJECTS_URL, 'featureFlags')).thenResolve({
      PREVENT_OP_SUBMISSION: true,
      SHOW_NON_PUBLISHED_LOCALIZATIONS: false
    });
  }
}
