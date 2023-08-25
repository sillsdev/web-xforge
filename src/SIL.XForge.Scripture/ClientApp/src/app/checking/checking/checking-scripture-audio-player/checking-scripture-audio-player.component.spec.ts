import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AudioTiming } from 'realtime-server/scriptureforge/models/audio-timing';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { getAudioTimings, getAudioTimingWithHeadings } from '../../../shared/test-utils';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const audioFile = 'test-audio-player.webm';
const textDocId: TextDocId = new TextDocId('project01', 1, 1);

describe('ScriptureAudioComponent', () => {
  it('can play and pause audio', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.playButton.nativeElement.click();
    await env.waitForPlayer();
    env.fixture.detectChanges();
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
    env.nextRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('2');
    env.previousRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('1');
    env.previousRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('1');
  });

  it('can skip through section headings', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.textDocId = textDocId;
    env.component.audioPlayer.timing = getAudioTimingWithHeadings();
    await env.waitForPlayer();
    env.nextRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('s_1');
    env.nextRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('2');
    env.previousRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('s_1');
    env.previousRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('1');
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
    expect(env.component.audioPlayer.audioPlayer!.audio!.currentTime).toBeGreaterThan(timings[1].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:1');
    await env.waitForPlayer(1400);
    expect(env.component.audioPlayer.audioPlayer!.audio!.currentTime).toBeGreaterThan(timings[3].from);
    expect(env.verseLabel.nativeElement.textContent).toEqual('Genesis 1:2');
    expect(verseChangedSpy).toHaveBeenCalledWith('s_1');
    expect(verseChangedSpy).toHaveBeenCalledWith('s_2');
  });

  it('can skip to previous verse', async () => {});

  it('skipping to previous verse remains on the current verse if within grace period', async () => {});

  it('skipping to the next verse will skip to the start of the current timing data if it has not started yet', async () => {});

  it('skipping beyond the last timing data will stop the player ', async () => {});
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingScriptureAudioPlayerComponent) audioPlayer!: CheckingScriptureAudioPlayerComponent;
}

class TestEnvironment {
  readonly mockPwaService = mock(PwaService);
  readonly mockedProjectService = mock(SFProjectService);
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingScriptureAudioPlayerComponent, AudioPlayerComponent, AudioTimePipe],
      providers: [
        { provide: PwaService, useFactory: () => instance(this.mockPwaService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) }
      ],
      imports: [UICommonModule, TestTranslocoModule]
    });
    when(this.mockPwaService.onlineStatus$).thenReturn(of(true));
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
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

  async waitForPlayer(ms: number = 50): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
