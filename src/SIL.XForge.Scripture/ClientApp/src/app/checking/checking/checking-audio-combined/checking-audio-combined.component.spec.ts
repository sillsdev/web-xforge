import { DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ngfModule } from 'angular-file';
import { mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { TestTranslocoModule, configureTestingModule, getAudioBlob } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from '../checking-audio-recorder/checking-audio-recorder.component';
import { CheckingAudioCombinedComponent } from './checking-audio-combined.component';

const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);

describe('CheckingAudioCombinedComponent', () => {
  configureTestingModule(() => ({
    declarations: [
      CheckingAudioCombinedComponent,
      CheckingAudioRecorderComponent,
      CheckingAudioPlayerComponent,
      AudioTimePipe,
      AudioPlayerComponent
    ],
    imports: [
      UICommonModule,
      ngfModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: I18nService, useMock: mockedI18nService }
    ]
  }));

  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('can upload an audio file and correct buttons show', () => {
    expect(env.uploadAudioButton).toBeTruthy();
    expect(env.component.source).toBe('');
    env.component.uploadAudioFile = new File([env.audioBlob], 'test.wav');
    env.component.prepareAudioFileUpload();
    env.fixture.detectChanges();
    expect(env.component.source).toContain('blob:http');
    expect(env.removeAudioButton).toBeTruthy();
    env.clickButton(env.removeAudioButton);
    expect(env.component.source).toBe('');
    expect(env.uploadAudioButton).toBeTruthy();
  });

  it('correct buttons appear throughout recording process', async () => {
    expect(env.recordButton).toBeTruthy();
    expect(env.uploadAudioButton).toBeTruthy();
    expect(env.removeAudioButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeFalsy();
    env.clickButton(env.recordButton);
    await env.waitForRecorder(1000);
    expect(env.recordButton).toBeFalsy();
    expect(env.uploadAudioButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeTruthy();
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    expect(env.tryAgainButton).toBeTruthy();
    env.clickButton(env.tryAgainButton);
    expect(env.recordButton).toBeTruthy();
    expect(env.uploadAudioButton).toBeTruthy();
  });

  it('correct buttons appear when source is already set', async () => {
    expect(env.recordButton).toBeTruthy();
    expect(env.uploadAudioButton).toBeTruthy();
    env.setAudioSource();
    expect(env.recordButton).toBeFalsy();
    expect(env.uploadAudioButton).toBeFalsy();
    expect(env.removeAudioButton).toBeTruthy();
  });
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly audioFile: string = 'test-audio-player.webm';
  readonly component: CheckingAudioCombinedComponent;
  readonly fixture: ComponentFixture<CheckingAudioCombinedComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.fixture = TestBed.createComponent(CheckingAudioCombinedComponent);
    this.component = this.fixture.componentInstance;

    this.realtimeService.addSnapshot(UserDoc.COLLECTION, {
      id: 'user01',
      data: { name: 'user' }
    });
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    this.fixture.detectChanges();
  }

  get audioBlob(): Blob {
    return getAudioBlob();
  }

  get recordButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.record'));
  }

  get removeAudioButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.remove-audio-file'));
  }
  get stopRecordingButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.stop'));
  }

  get tryAgainButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.remove-audio-file'));
  }

  get uploadAudioButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.upload-audio-file'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  setAudioSource(): void {
    this.component.source = this.audioFile;
    this.fixture.detectChanges();
  }

  async waitForRecorder(ms: number): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
