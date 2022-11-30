import { MdcDialog } from '@angular-mdc/web';
import { DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { I18nService } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SupportedBrowsersDialogComponent } from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { AudioTimePipe, CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedNavigator = mock(Navigator);
const mockedPwaService = mock(PwaService);
const mockedDialog = mock(MdcDialog);
const mockedI18nService = mock(I18nService);

describe('CheckingAudioRecorderComponent', () => {
  configureTestingModule(() => ({
    declarations: [CheckingAudioRecorderComponent, CheckingAudioPlayerComponent, AudioTimePipe],
    imports: [UICommonModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: NAVIGATOR, useMock: mockedNavigator },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: MdcDialog, useMock: mockedDialog },
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
    await env.waitForRecorder(1000);
    expect(env.recordButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeTruthy();
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
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
    env.rejectUserMedia = true;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedNoticeService.show(anything())).once();
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
    verify(mockedDialog.open(SupportedBrowsersDialogComponent, anything())).once();
    env.component.mediaDevicesUnsupported = false;
    env.clickButton(env.recordButton);
    await env.waitForRecorder(100);
    verify(mockedDialog.open(SupportedBrowsersDialogComponent, anything())).once();
    expect().nothing();
  });
});

class TestEnvironment {
  rejectUserMedia = false;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly component: CheckingAudioRecorderComponent;
  readonly fixture: ComponentFixture<CheckingAudioRecorderComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.fixture = TestBed.createComponent(CheckingAudioRecorderComponent);
    this.component = this.fixture.componentInstance;

    this.realtimeService.addSnapshot(UserDoc.COLLECTION, {
      id: 'user01',
      data: { name: 'user' }
    });
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    when(mockedNavigator.mediaDevices).thenReturn({
      getUserMedia: (mediaConstraints: MediaStreamConstraints) =>
        this.rejectUserMedia ? Promise.reject() : navigator.mediaDevices.getUserMedia(mediaConstraints)
    } as MediaDevices);
    when(mockedPwaService.isOnline).thenReturn(true);
    when(mockedPwaService.onlineStatus$).thenReturn(of(true));
    this.fixture.detectChanges();
  }

  get recordButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.record'));
  }

  get stopRecordingButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.stop-recording'));
  }

  get tryAgainButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.try-again'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  async waitForRecorder(ms: number) {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
