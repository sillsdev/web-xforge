import { CommonModule } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { instance, mock, when } from 'ts-mockito';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { OnlineStatusService } from '../../../xforge-common/online-status.service';
import { TestOnlineStatusModule } from '../../../xforge-common/test-online-status.module';
import { TestOnlineStatusService } from '../../../xforge-common/test-online-status.service';
import { SharedModule } from '../../shared/shared.module';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';
import { AttachAudioComponent } from './attach-audio.component';

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

  it('should show mic when not audio attached', () => {
    expect(env.iconButton.nativeElement.textContent).toBe('mic');
  });

  it('should show stop when recording', () => {
    const mockTextAndAudio = mock(TextAndAudioComponent);
    when(mockTextAndAudio.audioAttachment).thenReturn({ status: 'recording' });
    env.component.textAndAudio = instance(mockTextAndAudio);
    env.fixture.detectChanges();
    expect(env.iconButton.nativeElement.textContent).toBe('stop');
  });

  it('should show play when audio is attached', () => {
    const mockTextAndAudio = mock(TextAndAudioComponent);
    when(mockTextAndAudio.audioAttachment).thenReturn({ status: 'processed' });
    when(mockTextAndAudio.input).thenReturn({ audioUrl: 'blob://audio' });
    env.component.textAndAudio = instance(mockTextAndAudio);
    env.fixture.detectChanges();
    expect(env.component.audioPlayer).not.toBeNull();
    expect(env.iconButton.nativeElement.textContent).toBe('clear');
  });
});

class TestEnvironment {
  component: AttachAudioComponent;
  fixture: ComponentFixture<AttachAudioComponent>;
  constructor() {
    this.fixture = TestBed.createComponent(AttachAudioComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get iconButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('button .mat-icon'));
  }
}
