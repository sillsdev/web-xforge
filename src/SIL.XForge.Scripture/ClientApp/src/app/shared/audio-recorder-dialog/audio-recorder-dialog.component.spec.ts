import { OverlayContainer } from '@angular/cdk/overlay';
import { NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
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
import { ChildViewContainerComponent, TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { AudioPlayer } from '../audio/audio-player';
import { createMockMediaStream } from '../test-utils';
import {
  AudioRecorderDialogComponent,
  AudioRecorderDialogData,
  AudioRecorderDialogResult
} from './audio-recorder-dialog.component';

const mockedNoticeService = mock(NoticeService);
const mockedNavigator = mock(Navigator);
const mockedDialog = mock(DialogService);
const mockedI18nService = mock(I18nService);
const mockedConsole: MockConsole = MockConsole.install();

describe('AudioRecorderDialogComponent', () => {
  configureTestingModule(() => ({
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

  let overlayContainer: OverlayContainer;
  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
  });
  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  it('can record', async () => {
    const env = new TestEnvironment();
    env.waitForRecorder(300);
    expect(env.recordButton).toBeTruthy();
    expect(env.stopRecordingButton).toBeFalsy();
    env.clickButton(env.recordButton);
    // Record for more than 2 seconds in order to test the duration of blob files
    // which can fail with certain recording types
    await env.waitForRecorder(2400);
    expect(env.recordButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeTruthy();
    expect(env.component.audio.status).toEqual('recording');
    expect(env.recordingIndicator).not.toBeNull();
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    expect(env.component.audio.status).toEqual('processed');
    // The actual duration is slightly less than the length recorded so rounding is sufficient
    // If the duration fails it will return zero
    expect(Math.floor(await env.getAudioDuration())).toEqual(2);
    expect(env.component.hasAudioAttachment).toBe(true);
  });

  it('can restart', async () => {
    const env = new TestEnvironment();
    env.clickButton(env.recordButton);
    await env.waitForRecorder(1000);
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    env.clickButton(env.tryAgainButton);
    expect(env.recordButton).toBeTruthy();
  });

  it('should display message if microphone not accessible', async () => {
    const env = new TestEnvironment();
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
    const env = new TestEnvironment();
    env.component.mediaDevicesUnsupported = true;
    expect(env.recordButton).not.toBeNull();
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedDialog.openMatDialog(SupportedBrowsersDialogComponent, anything())).once();
    env.component.mediaDevicesUnsupported = false;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedDialog.openMatDialog(SupportedBrowsersDialogComponent, anything())).once();
  });

  it('return recorded audio on save', async () => {
    const env = new TestEnvironment();
    env.clickButton(env.recordButton);
    await env.waitForRecorder(1000);
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);

    const promiseForResult: Promise<AudioRecorderDialogResult> = firstValueFrom(env.dialogRef.afterClosed());
    env.clickButton(env.saveRecordingButton);
    const result: AudioRecorderDialogResult = await promiseForResult;
    expect(result.audio.status).toEqual('processed');
    expect(result.audio.url).toContain('blob:');
  });
});

class TestEnvironment {
  rejectUserMedia = false;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly component: AudioRecorderDialogComponent;
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  dialogRef: MatDialogRef<AudioRecorderDialogComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(countdown: boolean = false) {
    when(mockedI18nService.translateTextAroundTemplateTags(anything())).thenReturn({
      before: 'before ',
      templateTagText: '',
      after: ' after'
    });
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(AudioRecorderDialogComponent, {
      data: { countdown } as AudioRecorderDialogData
    });
    this.component = this.dialogRef.componentInstance;

    this.realtimeService.addSnapshot(UserDoc.COLLECTION, {
      id: 'user01',
      data: { name: 'user' }
    });
    when(mockedNavigator.mediaDevices).thenReturn({
      getUserMedia: (_: MediaStreamConstraints): Promise<MediaStream> =>
        this.rejectUserMedia ? Promise.reject('No microphone') : Promise.resolve(createMockMediaStream())
    } as MediaDevices);
    this.fixture.detectChanges();
  }

  get countdown(): HTMLElement {
    return this.overlayContainerElement.querySelector('.countdown.animate') as HTMLElement;
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get recordButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('.record') as HTMLElement;
  }

  get saveRecordingButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('.save-audio-file') as HTMLElement;
  }

  get stopRecordingButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('.stop') as HTMLElement;
  }

  get tryAgainButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('.remove-audio-file') as HTMLElement;
  }

  get recordingIndicator(): HTMLElement {
    return this.overlayContainerElement.querySelector('.visualizer') as HTMLElement;
  }

  clickButton(button: HTMLElement): void {
    button.click();
    this.fixture.detectChanges();
  }

  async getAudioDuration(): Promise<number> {
    const audio = new AudioPlayer(this.component.audio.url!, this.testOnlineStatusService);
    await this.waitForRecorder(100);
    return audio.duration;
  }

  async waitForRecorder(ms: number): Promise<any> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
