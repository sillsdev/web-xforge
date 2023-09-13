import { Component, DebugElement, Input, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AudioTiming } from 'realtime-server/scriptureforge/models/audio-timing';
import { BehaviorSubject, of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { AudioPlayerStub, getAudioTimingWithHeadings, getAudioTimings } from '../../checking-test.utils';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const audioFile = 'test-audio-player.webm';
const textDocId: TextDocId = new TextDocId('project01', 1, 1);

describe('ScriptureAudioComponent', () => {
  let env: TestEnvironment;
  beforeEach(fakeAsync(() => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    env = new TestEnvironment(template);
    env.fixture.detectChanges();

    env.component.audioPlayer.timing = getAudioTimings();
    env.component.audioPlayer.textDocId = textDocId;
    env.wait();
  }));

  it('can play and pause audio', fakeAsync(() => {
    const play = spyOn(env.audioPlayer.audio, 'play').and.callThrough();
    const pause = spyOn(env.audioPlayer.audio, 'pause').and.callThrough();

    env.playButton.nativeElement.click();
    env.wait();

    expect(env.isPlaying).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(0);

    env.playButton.nativeElement.click();
    env.wait();

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
  }));

  it('can skip to next and previous verse', fakeAsync(() => {
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');

    env.clickNextRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(1);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    env.clickPreviousRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(0);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickPreviousRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(0);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
  }));

  it('can skip forward and back through section headings', fakeAsync(() => {
    env.component.audioPlayer.timing = getAudioTimingWithHeadings();

    env.clickNextRef();
    env.wait();
    // section heading before verse 2
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickNextRef();
    env.wait();
    // verse 2
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    env.clickPreviousRef();
    env.wait();
    // move back to the section heading before verse 2
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickPreviousRef();
    env.wait();
    // verse 1
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
  }));

  it('emits verse changed event', fakeAsync(() => {
    const verseChangedSpy = jasmine.createSpy('verseChanged');
    env.component.audioPlayer.currentVerseChanged.subscribe(verseChangedSpy);
    expect(verseChangedSpy).toHaveBeenCalledTimes(0);

    env.audioPlayer.audio.currentTime = 1.5;
    env.audioPlayer.audio.timeUpdated$.next();
    expect(verseChangedSpy).toHaveBeenCalledTimes(1);
    expect(verseChangedSpy).toHaveBeenCalledWith('verse_1_2');
  }));

  it('emits verse changed event for section headings', fakeAsync(() => {
    const timings: AudioTiming[] = getAudioTimingWithHeadings();
    env.component.audioPlayer.timing = timings;

    const verseChangedSpy = jasmine.createSpy('verseChanged');
    env.component.audioPlayer.currentVerseChanged.subscribe(verseChangedSpy);

    env.audioPlayer.audio.currentTime = 1;
    env.audioPlayer.audio.timeUpdated$.next();
    env.wait();
    expect(env.currentTime).toBeGreaterThan(timings[1].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    expect(verseChangedSpy).toHaveBeenCalledWith('s_1');

    env.audioPlayer.audio.currentTime = 2.5;
    env.audioPlayer.audio.timeUpdated$.next();
    env.wait();
    expect(env.currentTime).toBeGreaterThan(timings[3].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    expect(verseChangedSpy).toHaveBeenCalledWith('s_2');
  }));

  it('pauses and emits on close', fakeAsync(() => {
    const pauseSpy = spyOn(env.component.audioPlayer, 'pause').and.callThrough();
    let count = 0;
    env.component.audioPlayer.closed.subscribe(() => count++);
    expect(pauseSpy).not.toHaveBeenCalled();

    env.component.audioPlayer.close();
    env.wait();
    expect(pauseSpy).toHaveBeenCalled();
    expect(count).toEqual(1);
  }));

  it('skipping to previous verse remains on the current verse if within grace period', fakeAsync(() => {
    env.component.audioPlayer.timing = [
      { textRef: '1', from: 0.0, to: 1.0 },
      { textRef: '2', from: 1.0, to: 4.5 },
      { textRef: '3', from: 4.5, to: 5.0 }
    ];

    env.currentTime = 4.1;
    expect(env.currentTime).toBeGreaterThan(4);
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(1);
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(0);
  }));

  it('skipping to the next verse will skip to the start of the current timing data if it has not started yet', fakeAsync(() => {
    env.component.audioPlayer.timing = [
      { textRef: '1', from: 3.0, to: 4.0 },
      { textRef: '2', from: 4.0, to: 5.0 }
    ];

    expect(env.currentTime).toEqual(0);
    env.clickNextRef();
    expect(env.currentTime).toEqual(3);
  }));
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingScriptureAudioPlayerComponent) audioPlayer!: CheckingScriptureAudioPlayerComponent;
}

@Component({
  selector: 'app-audio-player',
  template: '<p>Mock Audio Player</p>'
})
class AudioPlayerStubComponent {
  static onlineStatusService = mock(OnlineStatusService);
  audio: AudioPlayerStub;

  constructor() {
    when(AudioPlayerStubComponent.onlineStatusService.onlineStatus$).thenReturn(new BehaviorSubject(false));
    this.audio = new AudioPlayerStub(audioFile, instance(AudioPlayerStubComponent.onlineStatusService));
  }

  @Input() set source(source: string | undefined) {}
}

class TestEnvironment {
  readonly mockOnlineStatusService = mock(OnlineStatusService);
  readonly mockedProjectService = mock(SFProjectService);
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingScriptureAudioPlayerComponent, AudioPlayerStubComponent, AudioTimePipe],
      providers: [
        { provide: OnlineStatusService, useFactory: () => instance(this.mockOnlineStatusService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) }
      ],
      imports: [UICommonModule, TestTranslocoModule]
    });
    when(this.mockOnlineStatusService.onlineStatus$).thenReturn(of(true));
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
  }

  get audioPlayer(): AudioPlayerStubComponent {
    return this.component.audioPlayer.audioPlayer! as unknown as AudioPlayerStubComponent;
  }

  get currentTime(): number {
    return this.component.audioPlayer.audioPlayer!.audio!.currentTime;
  }

  set currentTime(value: number) {
    if (this.component.audioPlayer?.audioPlayer?.audio?.currentTime != null) {
      this.component.audioPlayer.audioPlayer.audio.currentTime = value;
    }
  }

  get playButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.play-pause-button'));
  }

  get previousRefButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.previous-ref-button'));
  }

  get nextRefButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.next-ref-button'));
  }

  get verseLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('.verse-label'));
  }

  get isPlaying(): boolean {
    return this.component.audioPlayer.isPlaying;
  }

  clickNextRef(): void {
    this.nextRefButton.nativeElement.click();
  }

  clickPreviousRef(): void {
    this.previousRefButton.nativeElement.click();
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
