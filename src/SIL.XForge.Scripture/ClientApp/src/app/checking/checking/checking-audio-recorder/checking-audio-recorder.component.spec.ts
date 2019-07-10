import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioTimePipe, CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

describe('CheckingAudioRecorderComponent', () => {
  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('can record', async () => {
    // spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(function(
    //   constraints: MediaStreamConstraints
    // ): Promise<MediaStream> {
    //   return new Promise<MediaStream>(resolve => new MediaStream());
    // });
    expect(env.recordButton).toBeTruthy();
    expect(env.stopRecordingButton).toBeFalsy();
    env.clickButton(env.recordButton);
    await env.waitForRecorder(1000);
    env.fixture.detectChanges();
    expect(env.recordButton).toBeFalsy();
    expect(env.stopRecordingButton).toBeTruthy();
    env.clickButton(env.stopRecordingButton);
    await env.waitForRecorder(100);
    env.fixture.detectChanges();
    expect(env.stopRecordingButton).toBeFalsy();
    expect(env.tryAgainButton).toBeTruthy();
    env.clickButton(env.tryAgainButton);
    expect(env.recordButton).toBeTruthy();
    expect(env.tryAgainButton).toBeFalsy();
  });

  it('can restart', () => {
    env.clickButton(env.recordButton);
    env.clickButton(env.stopRecordingButton);
    env.clickButton(env.tryAgainButton);
    expect(env.recordButton).toBeTruthy();
  });
});

class TestEnvironment {
  component: CheckingAudioRecorderComponent;
  fixture: ComponentFixture<CheckingAudioRecorderComponent>;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [CheckingAudioRecorderComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      imports: [UICommonModule]
    });
    this.fixture = TestBed.createComponent(CheckingAudioRecorderComponent);
    this.component = this.fixture.componentInstance;
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
  }
}
