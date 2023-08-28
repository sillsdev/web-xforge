import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { of } from 'rxjs';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { instance, mock, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const audioFile = 'test-audio-player.webm';
const shortAudioFile = 'test-audio-short.webm';
const timingData: AudioTiming[] = [
  { textRef: 'verse_1_1', from: 0.0, to: 1.0 },
  { textRef: 'verse_1_2', from: 1.0, to: 2.0 },
  { textRef: 'verse_1_3', from: 2.0, to: 3.0 }
];

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

  it('can skip to next verse', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);

    env.component.audioPlayer.timing = timingData;
    await env.waitForPlayer();
    env.nextRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('verse_1_2');
    env.previousRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('verse_1_1');
  });

  it('emits when chapter audio finishes', async () => {
    const template = `<app-checking-scripture-audio-player source="${shortAudioFile}" (finished)="finished = finished + 1"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    env.fixture.detectChanges();
    await env.waitForPlayer(500);
    env.playButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.isPlaying).toBe(true);
    expect(env.component.finished).toBe(0);
    await env.waitForPlayer(2000);
    expect(env.isPlaying).toBe(false);
    expect(env.component.finished).toBe(1);

    // play and finish a second time
    env.playButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.isPlaying).toBe(true);
    await env.waitForPlayer(2000);
    expect(env.isPlaying).toBe(false);
    expect(env.component.finished).toBe(2);
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingScriptureAudioPlayerComponent) audioPlayer!: CheckingScriptureAudioPlayerComponent;
  finished: number = 0;
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

  get isPlaying(): boolean {
    return this.component.audioPlayer.isPlaying;
  }

  async waitForPlayer(ms: number = 50): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
