import { Component, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { AudioPlayerStub } from '../../../checking/checking-test.utils';
import { AudioPlayer, AudioStatus } from '../audio-player';
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
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, env.testOnlineStatusService));
    const spy = jasmine.createSpy();
    env.component.baseComponent.isAudioAvailable$.subscribe(spy);

    env.component.baseComponent.fireStatusChange(AudioStatus.Available);

    expect(spy.calls.allArgs()).toEqual([[false], [true]]);
    expect(env.component.baseComponent.hasProblem).toBe(false);
  }));

  it('sets hasProblem when status changes from Init', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, env.testOnlineStatusService));
    expect(env.component.baseComponent.hasProblem).toBe(false);

    env.component.baseComponent.fireStatusChange(AudioStatus.Unavailable);

    expect(env.component.baseComponent.hasProblem).toBe(true);
  }));

  it('resets seek when audio becomes available', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, env.testOnlineStatusService));
    env.component.baseComponent.audio!.currentTime = 1;
    expect(env.component.baseComponent.audio!.currentTime).toBe(1);
    env.component.baseComponent.fireStatusChange(AudioStatus.Available);

    expect(env.component.baseComponent.audio!.currentTime).toBe(0);
  }));

  it('reflects status if it exists', fakeAsync(() => {
    env.component.baseComponent.setAudio(new AudioPlayerStub(audioFile, env.testOnlineStatusService));

    env.component.baseComponent.fireStatusChange(AudioStatus.Available);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.Available);

    env.component.baseComponent.fireStatusChange(AudioStatus.LocalNotAvailable);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.LocalNotAvailable);
  }));

  it('displays unavailable if online and audio status is null', fakeAsync(() => {
    env.component.baseComponent.source = '';
    env.wait();

    expect(env.testOnlineStatusService.isOnline).toBe(true);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.Unavailable);
  }));

  it('displays offline if offline and audio status is null', fakeAsync(() => {
    env.component.baseComponent.source = '';
    env.wait();

    env.testOnlineStatusService.setIsOnline(false);
    expect(env.component.baseComponent.audioStatus).toBe(AudioStatus.Offline);
  }));

  it('pauses audio on destroy', fakeAsync(() => {
    const pause = spyOn<any>(env.component.baseComponent.audio, 'pause');

    env.component.baseComponent.ngOnDestroy();

    expect(pause).toHaveBeenCalledTimes(1);
  }));
});

class TestEnvironment {
  readonly testOnlineStatusService: TestOnlineStatusService;
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, AudioTestComponent],
      providers: [{ provide: OnlineStatusService, useClass: TestOnlineStatusService }],
      imports: [TestOnlineStatusModule.forRoot()]
    });
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
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
