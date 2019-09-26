import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { configureTestSuite } from 'ng-bullet';
import { instance, mock, reset, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_REALTIME_DOC_TYPES } from '../../../core/models/sf-realtime-doc-types';
import { AudioTimePipe, CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

const mockedUserService = mock(UserService);

describe('CheckingAudioRecorderComponent', () => {
  configureTestSuite(() => {
    TestBed.configureTestingModule({
      declarations: [CheckingAudioRecorderComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      imports: [UICommonModule],
      providers: [{ provide: UserService, useFactory: () => instance(mockedUserService) }]
    });
  });

  let env: TestEnvironment;

  beforeEach(() => {
    reset(mockedUserService);
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
});

class TestEnvironment {
  readonly component: CheckingAudioRecorderComponent;
  readonly fixture: ComponentFixture<CheckingAudioRecorderComponent>;

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

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
    await new Promise(resolve => setTimeout(resolve, ms));
    this.fixture.detectChanges();
  }
}
