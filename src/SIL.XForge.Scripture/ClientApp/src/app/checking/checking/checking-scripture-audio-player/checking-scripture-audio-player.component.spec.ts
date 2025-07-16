import { Component, DebugElement, Input, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { BehaviorSubject } from 'rxjs';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { TextDocId } from '../../../core/models/text-doc';
import { AudioPlayerStub, getAudioTimings, getAudioTimingWithHeadings } from '../../checking-test.utils';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const audioFile = 'test-audio-player.webm';
const textDocId: TextDocId = new TextDocId('project01', 1, 1);

describe('ScriptureAudioComponent', () => {
  it('can play and pause audio', fakeAsync(() => {
    const env = new TestEnvironment();

    env.playButton.nativeElement.click();
    env.wait();

    expect(env.isPlaying).toBe(true);
    expect(env.audioPlaySpy).toHaveBeenCalledTimes(1);
    expect(env.audioPauseSpy).toHaveBeenCalledTimes(0);

    env.playButton.nativeElement.click();
    env.wait();

    expect(env.audioPlaySpy).toHaveBeenCalledTimes(1);
    expect(env.audioPauseSpy).toHaveBeenCalledTimes(1);
  }));

  it('can skip to next and previous verse', fakeAsync(() => {
    const env = new TestEnvironment();
    const timings = getAudioTimings();

    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');

    env.clickNextRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(timings[0].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickNextRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(timings[1].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    env.clickPreviousRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(timings[0].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickPreviousRef();
    env.wait();
    expect(env.audioPlayer.audio.currentTime).toBe(0);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
  }));

  it('can skip forward and back through section headings', fakeAsync(() => {
    const env = new TestEnvironment({ timings: getAudioTimingWithHeadings() });

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
    const env = new TestEnvironment();

    expect(env.component.audioPlayer.isAudioAvailable).toBe(true);
    expect(env.verseChangedSpy).withContext('it should not be called on init').toHaveBeenCalledTimes(0);

    env.audioPlayer.audio.currentTime = 1.5;
    env.audioPlayer.audio.timeUpdated$.next();
    expect(env.verseChangedSpy).toHaveBeenCalledTimes(1);
    expect(env.verseChangedSpy).toHaveBeenCalledWith('verse_1_2');
  }));

  it('emits verse changed event for section headings', fakeAsync(() => {
    const timings: AudioTiming[] = getAudioTimingWithHeadings();
    const env = new TestEnvironment({ timings });

    env.audioPlayer.audio.currentTime = 1;
    env.audioPlayer.audio.timeUpdated$.next();
    env.wait();
    expect(env.currentTime).toBeGreaterThan(timings[1].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    expect(env.verseChangedSpy).toHaveBeenCalledWith('s_1');

    env.audioPlayer.audio.currentTime = 2.5;
    env.audioPlayer.audio.timeUpdated$.next();
    env.wait();
    expect(env.currentTime).toBeGreaterThan(timings[3].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    expect(env.verseChangedSpy).toHaveBeenCalledWith('s_2');
  }));

  it('emits section heading when timing starts at greater than 0 seconds', fakeAsync(() => {
    const env = new TestEnvironment({
      timings: [
        { textRef: 's', from: 1.0, to: 2.0 },
        { textRef: '1', from: 2.0, to: 3.0 }
      ]
    });

    env.audioPlayer.audio.timeUpdated$.next();
    expect(env.verseChangedSpy).toHaveBeenCalledWith(undefined);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
  }));

  it('emits the next verse label when in between verses', fakeAsync(() => {
    const env = new TestEnvironment({
      timings: [
        { textRef: '1', from: 0, to: 1 },
        { textRef: '2', from: 2, to: 3 }
      ]
    });

    env.audioPlayer.audio.currentTime = 1.5;
    env.audioPlayer.audio.timeUpdated$.next();
    env.wait();
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
  }));

  it('emits the last verse label after timing data finishes', fakeAsync(() => {
    const env = new TestEnvironment({
      timings: [
        { textRef: '1', from: 0, to: 1 },
        { textRef: '2', from: 1, to: 2 },
        { textRef: '', from: 2, to: 3 }
      ]
    });

    env.audioPlayer.audio.currentTime = 3.5;
    env.audioPlayer.audio.timeUpdated$.next();
    env.wait();
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
  }));

  it('pauses and emits on close', fakeAsync(() => {
    const env = new TestEnvironment();

    expect(env.audioPauseSpy).not.toHaveBeenCalled();

    env.component.audioPlayer.close();
    env.wait();
    expect(env.audioPauseSpy).toHaveBeenCalled();
    expect(env.closedEventCount).toEqual(1);
  }));

  it('skipping to previous verse remains on the current verse if within grace period', fakeAsync(() => {
    const env = new TestEnvironment({
      timings: [
        { textRef: '1', from: 0.0, to: 1.0 },
        { textRef: '2', from: 1.0, to: 4.5 },
        { textRef: '3', from: 4.5, to: 5.0 }
      ]
    });

    env.currentTime = 4.1;
    expect(env.currentTime).toBeGreaterThan(4);
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(1);
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(0);
  }));

  it('skipping to the next verse will skip to the start of the current timing data if it has not started yet', fakeAsync(() => {
    const env = new TestEnvironment({
      timings: [
        { textRef: '1', from: 3.0, to: 4.0 },
        { textRef: '2', from: 4.0, to: 5.0 }
      ]
    });

    expect(env.currentTime).toEqual(0);
    env.clickNextRef();
    expect(env.currentTime).toEqual(3);
  }));

  it('skipping next or previous goes to the next or previous verse when timing is phrase level', fakeAsync(() => {
    const env = new TestEnvironment({
      timings: [
        { textRef: '1a', from: 0.0, to: 1.0 },
        { textRef: '1b', from: 1.0, to: 2.0 },
        { textRef: '2a', from: 2.0, to: 3.0 },
        { textRef: '2b', from: 3.0, to: 4.0 }
      ]
    });

    expect(env.currentTime).toEqual(0);
    env.clickNextRef();
    expect(env.currentTime).toEqual(2);
    env.currentTime = 3.5;
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(0);
  }));

  it('emits once when chapter audio finishes', fakeAsync(() => {
    const env = new TestEnvironment();

    env.component.audioPlayer.audioPlayer?.isAudioAvailable$.next(false);
    env.component.audioPlayer.audioPlayer?.isAudioAvailable$.next(true);
    env.component.audioPlayer.audioPlayer?.audio?.finishedPlaying$.emit();
    env.component.audioPlayer.audioPlayer?.audio?.finishedPlaying$.emit();

    expect(env.closedEventCount).toBe(1);
    expect(env.audioPauseSpy).toHaveBeenCalledTimes(1);
  }));

  it('disable player controls when audio is unavailable', fakeAsync(() => {
    const env = new TestEnvironment();

    env.component.audioPlayer.audioPlayer?.isAudioAvailable$.next(false);
    env.component.audioPlayer.source = undefined;
    env.wait();

    expect(env.playButton.attributes['disabled']).toBe('true');
    expect(env.previousRefButton.attributes['disabled']).toBe('true');
    expect(env.nextRefButton.attributes['disabled']).toBe('true');
  }));
});

@Component({
    selector: 'app-host', template: '',
    standalone: false
})
class HostComponent {
  @ViewChild(CheckingScriptureAudioPlayerComponent) audioPlayer!: CheckingScriptureAudioPlayerComponent;
}

@Component({
    selector: 'app-audio-player',
    template: '<p>Mock Audio Player</p>',
    standalone: false
})
class AudioPlayerStubComponent {
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  audio: AudioPlayerStub;
  isAudioAvailable$ = new BehaviorSubject(false);

  constructor() {
    this.audio = new AudioPlayerStub(audioFile, this.testOnlineStatusService);
  }

  @Input() set source(source: string | undefined) {
    if (source != null) this.isAudioAvailable$.next(true);
  }
}

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;
  verseChangedSpy: jasmine.Spy<jasmine.Func> = jasmine.createSpy('verseChanged');
  audioPlaySpy?: jasmine.Spy<jasmine.Func>;
  audioPauseSpy?: jasmine.Spy<jasmine.Func>;
  closedEventCount: number = 0;

  constructor({ timings }: Partial<{ timings: AudioTiming[] }> = {}) {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;

    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingScriptureAudioPlayerComponent, AudioPlayerStubComponent],
      imports: [UICommonModule, TestOnlineStatusModule.forRoot(), TestTranslocoModule]
    });
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;

    this.fixture.detectChanges();

    this.component.audioPlayer.timing = timings ?? getAudioTimings();
    this.component.audioPlayer.textDocId = textDocId;
    this.component.audioPlayer.currentVerseChanged.subscribe(this.verseChangedSpy);
    this.audioPlaySpy = spyOn(this.audioPlayer.audio, 'play').and.callThrough();
    this.audioPauseSpy = spyOn(this.audioPlayer.audio, 'pause').and.callThrough();
    this.component.audioPlayer.closed.subscribe(() => this.closedEventCount++);

    this.wait();
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
