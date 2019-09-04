import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { instance, mock, when } from 'ts-mockito';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { AudioTimePipe, CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

describe('CheckingAudioRecorderComponent', () => {
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
});

class TestEnvironment {
  readonly component: CheckingAudioRecorderComponent;
  readonly fixture: ComponentFixture<CheckingAudioRecorderComponent>;
  readonly mockedUserService = mock(UserService);

  private readonly offlineStore = new MemoryRealtimeOfflineStore();

  constructor() {
    TestBed.configureTestingModule({
      declarations: [CheckingAudioRecorderComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      imports: [UICommonModule],
      providers: [{ provide: UserService, useFactory: () => instance(this.mockedUserService) }]
    });
    this.fixture = TestBed.createComponent(CheckingAudioRecorderComponent);
    this.component = this.fixture.componentInstance;

    const currentUserDoc = new UserDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(UserDoc.COLLECTION, 'user01', { name: 'user' })
    );
    when(this.mockedUserService.getCurrentUser()).thenResolve(currentUserDoc);
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
