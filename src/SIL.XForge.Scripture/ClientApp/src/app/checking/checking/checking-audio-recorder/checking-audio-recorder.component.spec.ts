import { DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { anything, mock, verify, when } from 'ts-mockito';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { MockConsole } from 'xforge-common/mock-console';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SupportedBrowsersDialogComponent } from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { AudioPlayer } from '../../../shared/audio/audio-player';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

const mockedNoticeService = mock(NoticeService);
const mockedNavigator = mock(Navigator);
const mockedDialog = mock(DialogService);
const mockedI18nService = mock(I18nService);
const mockedConsole: MockConsole = MockConsole.install();

describe('CheckingAudioRecorderComponent', () => {
  configureTestingModule(() => ({
    declarations: [CheckingAudioRecorderComponent, CheckingAudioPlayerComponent, AudioPlayerComponent, AudioTimePipe],
    imports: [
      UICommonModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: NAVIGATOR, useMock: mockedNavigator },
      { provide: OnlineStatusService, useclass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockedDialog },
      { provide: I18nService, useMock: mockedI18nService }
    ]
  }));

  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('can record', async () => {
    expect(env.recordButton).toBeTruthy();
    expect(env.stopRecordingButton).toBeFalsy();
    env.clickButton(env.recordButton);
    // Record for more than 2 seconds in order to test the duration of blob files
    // which can fail with certain recording types i.e. RecordRTC.MediaStreamRecorder
    await env.waitForRecorder(2400);
    expect(env.recordButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeTruthy();
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    // The actual duration is slightly less than the length recorded so rounding is sufficient
    // If the duration fails it will return zero
    expect(Math.floor(await env.getAudioDuration())).toEqual(2);
    expect(env.component.hasAudioAttachment).toBe(true);
  });

  it('can restart', async () => {
    env.clickButton(env.recordButton);
    await env.waitForRecorder(1000);
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    env.clickButton(env.tryAgainButton);
    expect(env.recordButton).toBeTruthy();
  });

  it('should display message if microphone not accessible', async () => {
    mockedConsole.expectAndHide(/No microphone/);
    env.rejectUserMedia = true;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedNoticeService.show(anything())).once();
    mockedConsole.verify();
    mockedConsole.reset();
    env.rejectUserMedia = false;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(1000);
    expect(env.recordButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeTruthy();
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    expect(env.component.hasAudioAttachment).toBe(true);
  });

  it('should show browser unsupported dialog', async () => {
    env.component.mediaDevicesUnsupported = true;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedDialog.openMatDialog(SupportedBrowsersDialogComponent, anything())).once();
    env.component.mediaDevicesUnsupported = false;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedDialog.openMatDialog(SupportedBrowsersDialogComponent, anything())).once();
    expect().nothing();
  });
});

class TestEnvironment {
  rejectUserMedia = false;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly component: CheckingAudioRecorderComponent;
  readonly fixture: ComponentFixture<CheckingAudioRecorderComponent>;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.fixture = TestBed.createComponent(CheckingAudioRecorderComponent);
    this.component = this.fixture.componentInstance;

    this.realtimeService.addSnapshot(UserDoc.COLLECTION, {
      id: 'user01',
      data: { name: 'user' }
    });
    when(mockedNavigator.mediaDevices).thenReturn({
      getUserMedia: (mediaConstraints: MediaStreamConstraints) =>
        this.rejectUserMedia ? Promise.reject('No microphone') : navigator.mediaDevices.getUserMedia(mediaConstraints)
    } as MediaDevices);
    this.fixture.detectChanges();
  }

  async getAudioDuration(): Promise<number> {
    const audio = new AudioPlayer(this.component.audio.url!, this.testOnlineStatusService);
    await this.waitForRecorder(100);
    return audio.duration;
  }

  get recordButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.record'));
  }

  get stopRecordingButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.stop'));
  }

  get tryAgainButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.remove-audio-file'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  async waitForRecorder(ms: number): Promise<any> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
