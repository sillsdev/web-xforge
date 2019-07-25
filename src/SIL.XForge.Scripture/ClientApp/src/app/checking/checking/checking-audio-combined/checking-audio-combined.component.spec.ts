import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ngfModule } from 'angular-file';
import * as OTJson0 from 'ot-json0';
import { instance, mock, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { AudioTimePipe, CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from '../checking-audio-recorder/checking-audio-recorder.component';
import { CheckingAudioCombinedComponent } from './checking-audio-combined.component';

describe('CheckingAudioCombinedComponent', () => {
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
  audioFile: string = 'test-audio-player.webm';
  component: CheckingAudioCombinedComponent;
  fixture: ComponentFixture<CheckingAudioCombinedComponent>;
  mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);
  mockedUserService: UserService = mock(UserService);

  constructor() {
    TestBed.configureTestingModule({
      declarations: [
        CheckingAudioCombinedComponent,
        CheckingAudioRecorderComponent,
        CheckingAudioPlayerComponent,
        AudioTimePipe
      ],
      imports: [UICommonModule, ngfModule],
      providers: [{ provide: UserService, useFactory: () => instance(this.mockedUserService) }]
    });
    this.fixture = TestBed.createComponent(CheckingAudioCombinedComponent);
    this.component = this.fixture.componentInstance;

    const currentUserDoc = new UserDoc(
      new MemoryRealtimeDocAdapter(OTJson0.type, 'user01', { name: 'user' }),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedUserService.getCurrentUser()).thenResolve(currentUserDoc);
    this.fixture.detectChanges();
  }

  get audioBlob(): Blob {
    const base64 =
      'UklGRlgAAFdBVkVmbXQgEAAAAAEAAQBAHwAAPgAAAgAQAGRhdGFYAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgAGAAIAAgACAAIAAgACAAIAAgACAAIACgAKAA4AAgACAA4AEgACAAIAAgACAABGAAgYFADUAIBUAM4A' +
      'QF4AEgoGAAIOGgAeAAoAFgAKFgIAAAoACgASAAYAAgACAAACAAoAHgACABYaBgAOAAoABgASABIAAgACAAIABgACABIAFgACAAI' +
      'AAgAGAAIACgAOAAIABgACAAIAGgAOAAIABgAGAAoABgAOAAoABgACAAoABgACAAIAAgACABIACgACAAIABgAOAA4ACgACAAIAAg' +
      'AGAAYABgACAAIAAgACAAYABgAGAAYAAgACABIADgAGAA4ACgAGAAIAAgAGAAoAAgAKABIADgAKAA4SAB4AAB4ACgAKAA4AABIAF' +
      'gAKABIAEgAAABYABgASABoAFhoeEgAAHgAaAAYAAAAAHgAOAAYABg4AFgBAAAASAAIAGgACAAYSAB4AHgAeABoACgAGABIAABYA' +
      'RACEAJIYAEwAwFIAAAYAQgBAQF4AWhYAAIEKEAEFBRACgIDIAUCSFAoAAFIQEAIKAEQAwJQAgEBEAIwAlACAXACAQAoAEgBAjAD' +
      'AggAWDgYeCgAeAB4AGgYOAAIAGgAOAAAGAEYAQB4eAAAAHgYABgACAAIABgAaAAAACgAOAAAAAAYAHg4ADgAaDgoCAAICEgYAEg' +
      'ASAAoAAgACABIADgAKAAYABgAKAAIAGg4AAAoAEgAeAAASABYAAgAOAA4ADgAOAAYABgACAAIACgAKAAYAAgAGAAIAAgACAAIAB' +
      'gAGAAYAAgAGAAIABgAKAA4ACgAGAAIABgAGAAYABgAKAAIAAgACAAIAAgACAAIAAgAGAAYABgAGAAYAAgAGAAYABgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAI' +
      'AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAg' +
      'ACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACA' +
      'AIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA' +
      'AgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgA' +
      'CAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA' +
      'IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAA' +
      'gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC' +
      'AAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABgACAAYAAgACAAY' +
      'ABgACAAIABgACAAYACgACAAoAAgASAAACABIABgACABIABgACABYAAAIACh4AABIeAAIACgACAAIACgAWAAIABgAWGgAABg4AAB' +
      'oAFhYAAAIAAhoADgAeAAIATgoAAAIAGhYACgACAA4AGgAOABoAGgASABoACgAeEgAKAAAWFgAABACKAFYAHgAGDgAAHgACABYAB' +
      'gACABAQCAMQA1wAhADB2A=';
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'audio/wav' });
  }

  get recordButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.record'));
  }

  get removeAudioButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.remove-audio-file'));
  }
  get stopRecordingButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.stop-recording'));
  }

  get tryAgainButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.try-again'));
  }

  get uploadAudioButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.upload-audio-file'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  setAudioSource() {
    this.component.source = this.audioFile;
    this.fixture.detectChanges();
  }

  async waitForRecorder(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
    this.fixture.detectChanges();
  }
}
