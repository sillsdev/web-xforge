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

  it('versionSuffix returns an empty string when no feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedCommandService.onlineInvoke<{ [key: string]: boolean }>(PROJECTS_URL, 'featureFlags')).thenResolve({});
    // The first call loads the remote feature flags
    expect(env.service.versionSuffix).toEqual('');
    flush();
    expect(env.service.versionSuffix).toEqual('');
    verify(mockedCommandService.onlineInvoke(PROJECTS_URL, 'featureFlags')).once();
  }));

  it('getFeatureFlagVersion returns a string based on the order of feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(
      env.service.getFeatureFlagVersion([
        { key: 'key_a', description: 'Key a', readonly: true, enabled: true },
        { key: 'key_b', description: 'Key b', readonly: true, enabled: false },
        { key: 'key_c', description: 'Key c', readonly: true, enabled: false },
        { key: 'key_d', description: 'Key d', readonly: true, enabled: false },
        { key: 'key_e', description: 'Key e', readonly: true, enabled: true },
        { key: 'key_f', description: 'Key f', readonly: true, enabled: true },
        { key: 'key_g', description: 'Key g', readonly: true, enabled: false },
        { key: 'key_h', description: 'Key h', readonly: true, enabled: false }
      ])
    ).toEqual(1 + 16 + 32);
  }));

  it('getFeatureFlagVersion complexity test', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(
      env.service.getFeatureFlagVersion([
        { key: 'key_a', description: 'Key a', readonly: true, enabled: true },
        { key: 'key_b', description: 'Key b', readonly: true, enabled: false },
        { key: 'key_c', description: 'Key c', readonly: true, enabled: true },
        { key: 'key_d', description: 'Key d', readonly: true, enabled: false },
        { key: 'key_e', description: 'Key e', readonly: true, enabled: true },
        { key: 'key_f', description: 'Key f', readonly: true, enabled: false },
        { key: 'key_g', description: 'Key g', readonly: true, enabled: true },
        { key: 'key_h', description: 'Key h', readonly: true, enabled: false },
        { key: 'key_i', description: 'Key i', readonly: true, enabled: true },
        { key: 'key_j', description: 'Key j', readonly: true, enabled: false },
        { key: 'key_k', description: 'Key k', readonly: true, enabled: true },
        { key: 'key_l', description: 'Key l', readonly: true, enabled: false },
        { key: 'key_m', description: 'Key m', readonly: true, enabled: true },
        { key: 'key_n', description: 'Key n', readonly: true, enabled: false },
        { key: 'key_o', description: 'Key o', readonly: true, enabled: true },
        { key: 'key_p', description: 'Key p', readonly: true, enabled: false }
      ])
    ).toEqual(1 + 4 + 16 + 64 + 256 + 1024 + 4096 + 16384);
  }));

  it('getFeatureFlagVersion scales to up to 32 feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(
      env.service.getFeatureFlagVersion([
        { key: 'key_a', description: 'Key a', readonly: true, enabled: true },
        { key: 'key_b', description: 'Key b', readonly: true, enabled: false },
        { key: 'key_c', description: 'Key c', readonly: true, enabled: false },
        { key: 'key_d', description: 'Key d', readonly: true, enabled: false },
        { key: 'key_e', description: 'Key e', readonly: true, enabled: false },
        { key: 'key_f', description: 'Key f', readonly: true, enabled: false },
        { key: 'key_g', description: 'Key g', readonly: true, enabled: false },
        { key: 'key_h', description: 'Key h', readonly: true, enabled: false },
        { key: 'key_i', description: 'Key i', readonly: true, enabled: false },
        { key: 'key_j', description: 'Key j', readonly: true, enabled: false },
        { key: 'key_k', description: 'Key k', readonly: true, enabled: false },
        { key: 'key_l', description: 'Key l', readonly: true, enabled: false },
        { key: 'key_m', description: 'Key m', readonly: true, enabled: false },
        { key: 'key_n', description: 'Key n', readonly: true, enabled: false },
        { key: 'key_o', description: 'Key o', readonly: true, enabled: false },
        { key: 'key_p', description: 'Key p', readonly: true, enabled: false },
        { key: 'key_q', description: 'Key q', readonly: true, enabled: false },
        { key: 'key_r', description: 'Key r', readonly: true, enabled: false },
        { key: 'key_s', description: 'Key s', readonly: true, enabled: false },
        { key: 'key_t', description: 'Key t', readonly: true, enabled: false },
        { key: 'key_u', description: 'Key u', readonly: true, enabled: false },
        { key: 'key_v', description: 'Key f', readonly: true, enabled: false },
        { key: 'key_w', description: 'Key w', readonly: true, enabled: false },
        { key: 'key_x', description: 'Key x', readonly: true, enabled: false },
        { key: 'key_y', description: 'Key y', readonly: true, enabled: false },
        { key: 'key_z', description: 'Key z', readonly: true, enabled: false },
        { key: 'key_0', description: 'Key 0', readonly: true, enabled: false },
        { key: 'key_1', description: 'Key 1', readonly: true, enabled: false },
        { key: 'key_2', description: 'Key 2', readonly: true, enabled: false },
        { key: 'key_3', description: 'Key 3', readonly: true, enabled: false },
        { key: 'key_4', description: 'Key 4', readonly: true, enabled: false },
        { key: 'key_5', description: 'Key 5', readonly: true, enabled: true }
      ])
    ).toEqual(2147483648 + 1); // First and last bits
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
