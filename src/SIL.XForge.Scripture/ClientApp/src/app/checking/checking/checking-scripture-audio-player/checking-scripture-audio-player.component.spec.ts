import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AudioTiming } from 'realtime-server/scriptureforge/models/audio-timing';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { getAudioTimings, getAudioTimingWithHeadings } from '../../checking-test.utils';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const audioFile = 'test-audio-player.webm';
const textDocId: TextDocId = new TextDocId('project01', 1, 1);

// FIXME Tests are flaky
xdescribe('ScriptureAudioComponent', () => {
  it('can play and pause audio', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = getAudioTimings();
    await env.waitForPlayer();
    env.playButton.nativeElement.click();
    await env.waitForPlayer();
    env.fixture.detectChanges();
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    expect(env.isPlaying).toBe(true);

    env.playButton.nativeElement.click();
    await env.waitForPlayer();
    env.fixture.detectChanges();
    expect(env.isPlaying).toBe(false);
  });

  it('can skip to next and previous verse', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = getAudioTimings();
    await env.waitForPlayer();
    env.clickNextRef();
    await env.waitForPlayer();
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    env.clickPreviousRef();
    await env.waitForPlayer();
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickPreviousRef();
    await env.waitForPlayer();
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
  });

  it('can skip forward and back through section headings', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = getAudioTimingWithHeadings();
    await env.waitForPlayer();
    env.clickNextRef();
    await env.waitForPlayer();
    // section heading before verse 2
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickNextRef();
    await env.waitForPlayer();
    // verse 2
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    env.clickPreviousRef();
    await env.waitForPlayer();
    // move back to the section heading before verse 2
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    env.clickPreviousRef();
    await env.waitForPlayer();
    // verse 1
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
  });

  it('emits verse changed event', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = getAudioTimings();
    await env.waitForPlayer();
    const verseChangedSpy = jasmine.createSpy('verseChanged');
    env.component.audioPlayer.currentVerseChanged.subscribe(verseChangedSpy);
    env.playButton.nativeElement.click();
    await env.waitForPlayer(2000);
    expect(verseChangedSpy).toHaveBeenCalledWith('verse_1_2');
  });

  it('emits verse changed event for section headings', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    const timings: AudioTiming[] = getAudioTimingWithHeadings();
    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = timings;
    await env.waitForPlayer();
    const verseChangedSpy = jasmine.createSpy('verseChanged');
    env.component.audioPlayer.currentVerseChanged.subscribe(verseChangedSpy);
    env.playButton.nativeElement.click();
    await env.waitForPlayer(1400);
    expect(env.currentTime).toBeGreaterThan(timings[1].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    await env.waitForPlayer(1400);
    expect(env.currentTime).toBeGreaterThan(timings[3].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    expect(verseChangedSpy).toHaveBeenCalledWith('s_1');
    expect(verseChangedSpy).toHaveBeenCalledWith('s_2');
  });

  it('pauses and emits on close', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    const pauseSpy = spyOn(env.component.audioPlayer, 'pause').and.callThrough();
    let count = 0;
    env.component.audioPlayer.closed.subscribe(() => count++);
    expect(pauseSpy).not.toHaveBeenCalled();

    env.component.audioPlayer.close();
    await env.waitForPlayer();
    expect(pauseSpy).toHaveBeenCalled();
    expect(count).toEqual(1);
  });

  it('skipping to previous verse remains on the current verse if within grace period', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = [
      { textRef: '1', from: 0.0, to: 1.0 },
      { textRef: '2', from: 1.0, to: 4.5 },
      { textRef: '3', from: 4.5, to: 5.0 }
    ];
    await env.waitForPlayer();

    env.currentTime = 4.1;
    expect(env.currentTime).toBeGreaterThan(4);
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(1);
    env.clickPreviousRef();
    expect(env.currentTime).toEqual(0);
  });

  it('skipping to the next verse will skip to the start of the current timing data if it has not started yet', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = [
      { textRef: '1', from: 3.0, to: 4.0 },
      { textRef: '2', from: 4.0, to: 5.0 }
    ];
    await env.waitForPlayer();

    expect(env.currentTime).toEqual(0);
    env.clickNextRef();
    expect(env.currentTime).toEqual(3);
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingScriptureAudioPlayerComponent) audioPlayer!: CheckingScriptureAudioPlayerComponent;
}

class TestEnvironment {
  readonly mockOnlineStatusService = mock(OnlineStatusService);
  readonly mockedProjectService = mock(SFProjectService);
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingScriptureAudioPlayerComponent, AudioPlayerComponent, AudioTimePipe],
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

  async waitForPlayer(ms: number = 50): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
