import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayer, AudioStatus } from '../../../shared/audio/audio-player';
import { AudioSegmentPlayer } from '../../../shared/audio/audio-segment-player';
import { SingleButtonAudioPlayerComponent } from './single-button-audio-player.component';

const audioMock = mock(AudioPlayer);
when(audioMock.status$).thenReturn(new BehaviorSubject<AudioStatus>(AudioStatus.Available));

describe('SingleButtonAudioPlayerComponent', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, TestOnlineStatusModule.forRoot(), NoopAnimationsModule],
    declarations: [TestComponent, MockComponent],
    providers: [{ provide: OnlineStatusService, useClass: TestOnlineStatusService }]
  }));

  let env: TestEnvironment;
  beforeEach(fakeAsync(() => {
    env = new TestEnvironment();
    env.wait();
  }));

  it('creates full audio player by default', fakeAsync(() => {
    expect(env.component.player.audio instanceof AudioPlayer).toBe(true);
    expect(env.component.player.audio instanceof AudioSegmentPlayer).toBe(false);
  }));

  it('creates segment audio player when given range', fakeAsync(() => {
    env.component.start = 2;
    env.component.end = 4;

    env.wait();

    expect(env.component.player.audio instanceof AudioSegmentPlayer).toBe(true);
  }));

  it('shows content when audio is available', fakeAsync(() => {
    env.component.player.isAudioAvailable$.next(true);
    env.wait();

    expect(env.content).not.toBeNull();
    expect(window.getComputedStyle(env.content.nativeElement)['display']).not.toBe('none');
  }));

  it('plays and stops', fakeAsync(() => {
    env.component.player.setAudio(instance(audioMock));

    env.component.player.play();
    verify(audioMock.play()).once();

    env.component.player.stop();
    verify(audioMock.stop()).once();
    expect(env.component.player.audio).not.toBeNull();
  }));

  it('does not reset when playing finishes', fakeAsync(() => {
    env.component.player.setAudio(instance(audioMock));
    resetCalls(audioMock);

    env.component.player.hasFinishedPlayingOnce$.next(true);

    verify(audioMock.stop()).never();
    expect(env.component.player.hasFinishedPlayingOnce$.value).toBe(true);
  }));

  it('reflects audio.isPlaying', fakeAsync(() => {
    env.component.player.setAudio(instance(audioMock));

    when(audioMock.isPlaying).thenReturn(false);
    expect(env.component.player.playing).toBe(false);

    when(audioMock.isPlaying).thenReturn(true);
    expect(env.component.player.playing).toBe(true);
  }));

  it('progressInDegrees reflects seek position', fakeAsync(() => {
    // Ensure progress is blank if no audio player
    env.component.player.setAudio(undefined);
    env.component.player.calculateProgress();
    expect(env.component.player.progressInDegrees).toBe('');

    env.component.player.setAudio(instance(audioMock));

    when(audioMock.seek).thenReturn(75);
    env.component.player.calculateProgress();
    expect(env.component.player.progressInDegrees).toBe('270deg');

    when(audioMock.seek).thenReturn(100);
    env.component.player.calculateProgress();
    expect(env.component.player.progressInDegrees).toBe('360deg');
  }));

  it('fires first time finished event only once', fakeAsync(() => {
    let count = 0;
    env.component.player.hasFinishedPlayingOnce$.subscribe(newVal => {
      if (newVal) {
        count++;
      }
    });

    env.component.player.audio?.finishedPlaying$.emit();
    env.component.player.audio?.finishedPlaying$.emit();
    env.component.player.audio?.finishedPlaying$.emit();

    expect(count).toBe(1);
  }));

  it('fires first time finished event as false when input changes', fakeAsync(() => {
    let count = 0;
    env.component.player.hasFinishedPlayingOnce$.subscribe(newVal => {
      if (!newVal) {
        count++; //increment only if event fires as false
      }
    });

    expect(count).toBe(1); //called on subscribe

    env.component.source = 'test-audio-player-b.webm';
    env.wait();

    expect(count).toBe(2);
  }));

  it('pauses audio when disposed', fakeAsync(() => {
    const spy = spyOn<any>(env.component.player.audio!, 'pause').and.callThrough();

    env.component.player.audio!.dispose();

    expect(spy).toHaveBeenCalledTimes(1);
  }));
});

class TestEnvironment {
  readonly component: MockComponent;
  readonly fixture: ComponentFixture<MockComponent>;
  readonly ngZone: NgZone;

  constructor() {
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(MockComponent);
    this.component = this.fixture.componentInstance;
  }

  get content(): DebugElement {
    return this.fixture.debugElement.query(By.css('#content'));
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}

@Component({
  template: `<app-single-button-audio-player #player [source]="source" [start]="start" [end]="end">
    <mat-icon id="content">play</mat-icon>
  </app-single-button-audio-player>`
})
class MockComponent {
  @ViewChild('player') player!: TestComponent;
  source: string;
  start: number | undefined;
  end: number | undefined;
  constructor() {
    this.source = 'test-audio-player.webm';
  }
}

class TestComponent extends SingleButtonAudioPlayerComponent {
  public setAudio(audioPlayer: AudioPlayer | undefined): void {
    this.audio = audioPlayer;
  }
}
