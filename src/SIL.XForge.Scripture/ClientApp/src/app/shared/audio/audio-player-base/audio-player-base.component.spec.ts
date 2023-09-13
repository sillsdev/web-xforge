import { Component, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { AudioPlayerStub } from 'src/app/checking/checking-test.utils';
import { CheckingScriptureAudioPlayerComponent } from 'src/app/checking/checking/checking-scripture-audio-player/checking-scripture-audio-player.component';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { instance, mock, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayer, AudioStatus } from '../audio-player';
import { AudioTimePipe } from '../audio-time-pipe';
import { AudioPlayerBaseComponent } from './audio-player-base.component';

const audioFile = 'test-audio-player.webm';

describe('AudioPlayerBaseComponent', () => {
  let env: TestEnvironment;
  beforeEach(fakeAsync(() => {
    const template = `<app-audio-player source="${audioFile}"></app-audio-player>`;
    env = new TestEnvironment(template);
    env.wait();
  }));

  it('creates AudioPlayer when source is set', fakeAsync(() => {
    expect(env.component.baseComponent.audio).toBeInstanceOf(AudioPlayer);
    expect(env.component.baseComponent.audio).not.toBeInstanceOf(AudioPlayerStub);
  }));

  it('clears audio when source is cleared', fakeAsync(() => {
    env.component.baseComponent.source = '';
    env.wait();

    expect(env.component.baseComponent.audio).toBe(undefined);
  }));

  it('fires isAudioAvailable when audio becomes available', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, instance(env.mockOnlineStatusService)));
    const spy = jasmine.createSpy();
    env.component.baseComponent.isAudioAvailable$.subscribe(spy);

    env.component.baseComponent.fireStatusChange(AudioStatus.Available);

    expect(spy.calls.allArgs()).toEqual([[false], [true]]);
    expect(env.component.baseComponent.isAudioInitComplete).toBe(true);
  }));

  it('sets isAudioInitComplete when status changes from Init', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, instance(env.mockOnlineStatusService)));
    expect(env.component.baseComponent.isAudioInitComplete).toBe(false);

    env.component.baseComponent.fireStatusChange(AudioStatus.Unavailable);

    expect(env.component.baseComponent.isAudioInitComplete).toBe(true);
  }));

  it('resets seek when audio becomes available', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, instance(env.mockOnlineStatusService)));
    env.component.baseComponent.audio!.currentTime = 1;
    expect(env.component.baseComponent.audio!.currentTime).toBe(1);
    env.component.baseComponent.fireStatusChange(AudioStatus.Available);

    expect(env.component.baseComponent.audio!.currentTime).toBe(0);
  }));

  it('reflects status if it exists', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, instance(env.mockOnlineStatusService)));

    env.component.baseComponent.fireStatusChange(AudioStatus.Available);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.Available);

    env.component.baseComponent.fireStatusChange(AudioStatus.LocalNotAvailable);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.LocalNotAvailable);
  }));

  it('displays unavailable if online and audio status is null', fakeAsync(() => {
    env.component.baseComponent.source = '';
    env.wait();

    expect(instance(env.mockOnlineStatusService).isOnline).toBe(true);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.Unavailable);
  }));

  it('displays offline if offline and audio status is null', fakeAsync(() => {
    env.component.baseComponent.source = '';
    env.wait();

    when(env.mockOnlineStatusService.isOnline).thenReturn(false);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.Offline);
  }));

  it('pauses audio on destroy', fakeAsync(() => {
    const pause = spyOn<any>(env.component.baseComponent.audio, 'pause');

    env.component.baseComponent.ngOnDestroy();

    expect(pause).toHaveBeenCalledTimes(1);
  }));
});

class TestEnvironment {
  readonly mockOnlineStatusService = mock(OnlineStatusService);
  readonly mockedProjectService = mock(SFProjectService);
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingScriptureAudioPlayerComponent, AudioTimePipe, AudioTestComponent],
      providers: [
        { provide: OnlineStatusService, useFactory: () => instance(this.mockOnlineStatusService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) }
      ],
      imports: [UICommonModule, TestTranslocoModule]
    });
    when(this.mockOnlineStatusService.onlineStatus$).thenReturn(of(true));
    when(this.mockOnlineStatusService.isOnline).thenReturn(true);
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}

@Component({
  selector: 'app-audio-player',
  template: '<p>Mock Audio Player</p>'
})
class AudioTestComponent extends AudioPlayerBaseComponent {
  setAudio(audio: AudioPlayer): void {
    this.audio = audio;
  }

  fireStatusChange(status: AudioStatus): void {
    this.audio?.status$.next(status);
  }
}

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(AudioTestComponent) baseComponent!: AudioTestComponent;
}
