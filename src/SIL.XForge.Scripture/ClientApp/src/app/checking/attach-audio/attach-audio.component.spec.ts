import { CommonModule } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { instance, mock, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SharedModule } from '../../shared/shared.module';
import { CheckingAudioRecorderComponent } from '../checking/checking-audio-recorder/checking-audio-recorder.component';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';
import { AttachAudioComponent } from './attach-audio.component';

const mockTextAndAudio = mock(TextAndAudioComponent);
const mockCheckingAudioRecorder = mock(CheckingAudioRecorderComponent);

describe('AttachAudioComponent', () => {
  let env: TestEnvironment;

  configureTestingModule(() => ({
    imports: [CommonModule, UICommonModule, SharedModule, TestTranslocoModule, TestOnlineStatusModule.forRoot()],
    declarations: [AttachAudioComponent],
    providers: [
      {
        provide: OnlineStatusService,
        useClass: TestOnlineStatusService
      }
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('should show mic when no audio attached', () => {
    when(mockTextAndAudio.input).thenReturn({});
    when(mockTextAndAudio.audioAttachment).thenReturn({ status: 'reset' });
    env.fixture.detectChanges();
    expect(env.iconButton.nativeElement.textContent).toBe('mic');
    env.iconButton.nativeElement.click();
    env.fixture.detectChanges();
    verify(mockCheckingAudioRecorder.startRecording()).once();
  });

  it('should show stop when recording', () => {
    when(mockTextAndAudio.audioAttachment).thenReturn({ status: 'recording' });
    env.component.textAndAudio = instance(mockTextAndAudio);
    env.fixture.detectChanges();
    expect(env.iconButton.nativeElement.textContent).toBe('stop');
    env.iconButton.nativeElement.click();
    env.fixture.detectChanges();
    verify(mockCheckingAudioRecorder.stopRecording()).once();
  });

  it('should show clear when audio is attached', () => {
    when(mockTextAndAudio.audioAttachment).thenReturn({ status: 'processed' });
    when(mockTextAndAudio.input).thenReturn({ audioUrl: 'blob://audio' });
    env.fixture.detectChanges();
    expect(env.component.audioPlayer).not.toBeNull();
    expect(env.iconButton.nativeElement.textContent).toBe('clear');
    env.iconButton.nativeElement.click();
    env.fixture.detectChanges();
    verify(mockCheckingAudioRecorder.resetRecording()).once();
  });
});

class TestEnvironment {
  component: AttachAudioComponent;
  fixture: ComponentFixture<AttachAudioComponent>;
  constructor() {
    this.fixture = TestBed.createComponent(AttachAudioComponent);
    this.component = this.fixture.componentInstance;
    when(mockTextAndAudio.audioComponent).thenReturn(instance(mockCheckingAudioRecorder));
    this.component.textAndAudio = instance(mockTextAndAudio);
    this.fixture.detectChanges();
  }

  get iconButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('button .mat-icon'));
  }
}
