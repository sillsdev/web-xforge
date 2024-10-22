import { CommonModule } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DialogService } from '../../../xforge-common/dialog.service';
import { AudioRecorderDialogComponent } from '../../shared/audio-recorder-dialog/audio-recorder-dialog.component';
import { SharedModule } from '../../shared/shared.module';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';
import { AttachAudioComponent } from './attach-audio.component';

const mockDialogService = mock(DialogService);

describe('AttachAudioComponent', () => {
  let env: TestEnvironment;

  configureTestingModule(() => ({
    imports: [CommonModule, UICommonModule, SharedModule, TestTranslocoModule, TestOnlineStatusModule.forRoot()],
    declarations: [AttachAudioComponent],
    providers: [
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockDialogService }
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('should show mic when no audio attached', fakeAsync(() => {
    when(env.mockTextAndAudio.input).thenReturn({});
    when(env.mockTextAndAudio.audioAttachment).thenReturn({ status: 'reset' });
    env.fixture.detectChanges();
    expect(env.iconButton.nativeElement.textContent).toBe('mic');
    env.iconButton.nativeElement.click();
    tick();
    env.fixture.detectChanges();
    verify(mockDialogService.openMatDialog(AudioRecorderDialogComponent, anything())).once();
    verify(env.mockTextAndAudio.setAudioAttachment(anything())).once();
  }));

  it('does not save when no audio recorded', fakeAsync(() => {
    when(env.mockTextAndAudio.input).thenReturn({});
    when(env.mockRecorderDialogRef.afterClosed()).thenReturn(of(undefined));
    env.fixture.detectChanges();
    env.iconButton.nativeElement.click();
    tick();
    env.fixture.detectChanges();
    verify(mockDialogService.openMatDialog(AudioRecorderDialogComponent, anything())).once();
    verify(env.mockTextAndAudio.setAudioAttachment(anything())).never();
    expect(env.iconButton.nativeElement.textContent).toBe('mic');
  }));

  it('should show clear when audio is attached', () => {
    when(env.mockTextAndAudio.audioAttachment).thenReturn({ status: 'processed' });
    when(env.mockTextAndAudio.input).thenReturn({ audioUrl: 'blob://audio' });
    env.fixture.detectChanges();
    expect(env.component.audioPlayer).not.toBeNull();
    expect(env.iconButton.nativeElement.textContent).toBe('clear');
    env.iconButton.nativeElement.click();
    env.fixture.detectChanges();
    verify(env.mockTextAndAudio.resetAudio()).once();
  });
});

class TestEnvironment {
  component: AttachAudioComponent;
  fixture: ComponentFixture<AttachAudioComponent>;
  mockTextAndAudio = mock(TextAndAudioComponent);
  mockRecorderDialogRef = mock(MatDialogRef<AudioRecorderDialogComponent>);

  constructor() {
    when(this.mockRecorderDialogRef.afterClosed()).thenReturn(
      of({ audio: { url: 'blob://audio', status: 'processed' } })
    );
    when(mockDialogService.openMatDialog(AudioRecorderDialogComponent, anything())).thenReturn(
      instance(this.mockRecorderDialogRef)
    );
    this.fixture = TestBed.createComponent(AttachAudioComponent);
    this.component = this.fixture.componentInstance;
    this.component.textAndAudio = instance(this.mockTextAndAudio);
    this.fixture.detectChanges();
  }

  get iconButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('button .mat-icon'));
  }
}
