import { fakeAsync, flush, TestBed } from '@angular/core/testing';
import { mock, verify, when } from 'ts-mockito';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { configureTestingModule } from 'xforge-common/test-utils';
import { FeatureFlagService } from './feature-flag.service';

const mockedAnonymousService = mock(AnonymousService);

describe('FeatureFlagService', () => {
  configureTestingModule(() => ({
    imports: [TestOnlineStatusModule.forRoot()],
    providers: [{ provide: AnonymousService, useMock: mockedAnonymousService }]
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
    verify(mockedAnonymousService.featureFlags()).once();
  }));

  it('undefined remote feature flags default to false', fakeAsync(() => {
    const env = new TestEnvironment();
    // The first call loads the remote feature flags
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    flush();
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    verify(mockedAnonymousService.featureFlags()).once();
  }));

  it('remote feature flags are read only', fakeAsync(() => {
    const env = new TestEnvironment();
    // The first call loads the remote feature flags
    expect(env.service.showNonPublishedLocalizations.enabled).toBeFalsy();
    flush();
    expect(env.service.showNonPublishedLocalizations.readonly).toBeTruthy();
    verify(mockedAnonymousService.featureFlags()).once();
  }));

  it('does not throw errors when retrieving remote feature flags', fakeAsync(() => {
    const env = new TestEnvironment(new Error('error'));
    // The first call loads the remote feature flags
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    flush();
    expect(env.service.preventOpAcknowledgement.enabled).toBeFalsy();
    verify(mockedAnonymousService.featureFlags()).once();
  }));

  it('versionSuffix returns an empty string when no feature flags', fakeAsync(() => {
    const env = new TestEnvironment({});
    // The first call loads the remote feature flags
    expect(env.service.versionSuffix).toEqual('');
    flush();
    expect(env.service.versionSuffix).toEqual('');
    verify(mockedAnonymousService.featureFlags()).once();
  }));

  it('getFeatureFlagVersion returns a string based on the order of feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(
      env.service.getFeatureFlagVersion([
        { key: 'key_a', description: 'Key a', readonly: true, position: 0, enabled: true },
        { key: 'key_b', description: 'Key b', readonly: true, position: 1, enabled: false },
        { key: 'key_c', description: 'Key c', readonly: true, position: 2, enabled: false },
        { key: 'key_d', description: 'Key d', readonly: true, position: 3, enabled: false },
        { key: 'key_e', description: 'Key e', readonly: true, position: 4, enabled: true },
        { key: 'key_f', description: 'Key f', readonly: true, position: 5, enabled: true },
        { key: 'key_g', description: 'Key g', readonly: true, position: 6, enabled: false },
        { key: 'key_h', description: 'Key h', readonly: true, position: 7, enabled: false }
      ])
    ).toEqual(1 + 16 + 32);
  }));

  it('getFeatureFlagVersion complexity test', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(
      env.service.getFeatureFlagVersion([
        { key: 'key_a', description: 'Key a', readonly: true, position: 0, enabled: true }, //       1
        { key: 'key_b', description: 'Key b', readonly: true, position: 1, enabled: false }, //      2
        { key: 'key_c', description: 'Key c', readonly: true, position: 2, enabled: true }, //       4
        { key: 'key_d', description: 'Key d', readonly: true, position: 3, enabled: false }, //      8
        { key: 'key_e', description: 'Key e', readonly: true, position: 4, enabled: true }, //      16
        { key: 'key_f', description: 'Key f', readonly: true, position: 5, enabled: false }, //     32
        { key: 'key_g', description: 'Key g', readonly: true, position: 6, enabled: true }, //      64
        { key: 'key_h', description: 'Key h', readonly: true, position: 7, enabled: false }, //    128
        { key: 'key_i', description: 'Key i', readonly: true, position: 8, enabled: true }, //     256
        { key: 'key_j', description: 'Key j', readonly: true, position: 9, enabled: false }, //    512
        { key: 'key_k', description: 'Key k', readonly: true, position: 10, enabled: true }, //   1024
        { key: 'key_l', description: 'Key l', readonly: true, position: 11, enabled: false }, //  2048
        { key: 'key_m', description: 'Key m', readonly: true, position: 12, enabled: true }, //   4096
        { key: 'key_n', description: 'Key n', readonly: true, position: 13, enabled: false }, //  8192
        { key: 'key_o', description: 'Key o', readonly: true, position: 14, enabled: true }, //  16384
        { key: 'key_p', description: 'Key p', readonly: true, position: 15, enabled: false } //  32768
      ])
    ).toEqual(1 + 4 + 16 + 64 + 256 + 1024 + 4096 + 16384);
  }));

  it('getFeatureFlagVersion scales to up to 32 feature flags', fakeAsync(() => {
    const env = new TestEnvironment();
    const twoPower31: number = Math.pow(2, 31); // 2147483648
    expect(
      env.service.getFeatureFlagVersion([
        { key: 'key_a', description: 'Key a', readonly: true, position: 0, enabled: true },
        { key: 'key_b', description: 'Key b', readonly: true, position: 1, enabled: false },
        { key: 'key_c', description: 'Key c', readonly: true, position: 2, enabled: false },
        { key: 'key_d', description: 'Key d', readonly: true, position: 3, enabled: false },
        { key: 'key_e', description: 'Key e', readonly: true, position: 4, enabled: false },
        { key: 'key_f', description: 'Key f', readonly: true, position: 5, enabled: false },
        { key: 'key_g', description: 'Key g', readonly: true, position: 6, enabled: false },
        { key: 'key_h', description: 'Key h', readonly: true, position: 7, enabled: false },
        { key: 'key_i', description: 'Key i', readonly: true, position: 8, enabled: false },
        { key: 'key_j', description: 'Key j', readonly: true, position: 9, enabled: false },
        { key: 'key_k', description: 'Key k', readonly: true, position: 10, enabled: false },
        { key: 'key_l', description: 'Key l', readonly: true, position: 11, enabled: false },
        { key: 'key_m', description: 'Key m', readonly: true, position: 12, enabled: false },
        { key: 'key_n', description: 'Key n', readonly: true, position: 13, enabled: false },
        { key: 'key_o', description: 'Key o', readonly: true, position: 14, enabled: false },
        { key: 'key_p', description: 'Key p', readonly: true, position: 15, enabled: false },
        { key: 'key_q', description: 'Key q', readonly: true, position: 16, enabled: false },
        { key: 'key_r', description: 'Key r', readonly: true, position: 17, enabled: false },
        { key: 'key_s', description: 'Key s', readonly: true, position: 18, enabled: false },
        { key: 'key_t', description: 'Key t', readonly: true, position: 19, enabled: false },
        { key: 'key_u', description: 'Key u', readonly: true, position: 20, enabled: false },
        { key: 'key_v', description: 'Key f', readonly: true, position: 21, enabled: false },
        { key: 'key_w', description: 'Key w', readonly: true, position: 22, enabled: false },
        { key: 'key_x', description: 'Key x', readonly: true, position: 23, enabled: false },
        { key: 'key_y', description: 'Key y', readonly: true, position: 24, enabled: false },
        { key: 'key_z', description: 'Key z', readonly: true, position: 25, enabled: false },
        { key: 'key_0', description: 'Key 0', readonly: true, position: 26, enabled: false },
        { key: 'key_1', description: 'Key 1', readonly: true, position: 27, enabled: false },
        { key: 'key_2', description: 'Key 2', readonly: true, position: 28, enabled: false },
        { key: 'key_3', description: 'Key 3', readonly: true, position: 29, enabled: false },
        { key: 'key_4', description: 'Key 4', readonly: true, position: 30, enabled: false },
        { key: 'key_5', description: 'Key 5', readonly: true, position: 31, enabled: true }
      ])
    ).toEqual(twoPower31 + 1); // First and last bits
  }));

  it('getEnabledFlags returns an empty array when no feature flags are selected', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.service.getEnabledFlags()).toEqual([]);
  }));

  it('getEnabledFlags returns an array of strings when feature flags are selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.service.darkMode.enabled = true;
    expect(env.service.getEnabledFlags()).toEqual(['DarkMode']);

    // Clean up
    env.service.darkMode.enabled = false;
  }));
});

class TestEnvironment {
  readonly service: FeatureFlagService;

  constructor(
    featureFlags: { [key: string]: boolean } | Error = {
      PREVENT_OP_SUBMISSION: true,
      SHOW_NON_PUBLISHED_LOCALIZATIONS: false
    }
  ) {
    if (featureFlags instanceof Error) {
      when(mockedAnonymousService.featureFlags()).thenReject(featureFlags);
    } else {
      when(mockedAnonymousService.featureFlags()).thenResolve(featureFlags);
    }
    this.service = TestBed.inject(FeatureFlagService);
  }
}
