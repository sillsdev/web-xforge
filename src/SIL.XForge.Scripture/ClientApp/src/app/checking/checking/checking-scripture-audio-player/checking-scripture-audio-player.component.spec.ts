import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player.component';
import { AudioTimePipe } from '../checking-audio-player/checking-audio-player.component';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const audioFile = 'test-audio-player.webm';
const timingData: AudioTiming[] = [
  { textRef: 'verse_1_1', from: 0.0, to: 1.0 },
  { textRef: 'verse_1_2', from: 1.0, to: 2.0 },
  { textRef: 'verse_1_3', from: 2.0, to: 3.0 }
];

describe('ScriptureAudioComponent', () => {
  it('can play and pause audio', async () => {
    const template = `<app-checking-scripture-audio-player source="${audioFile}"></app-checking-scripture-audio-player>`;
    const env = new TestEnvironment(template);
    await env.waitForPlayer();
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
    await env.waitForPlayer();

    env.component.audioPlayer.timing = timingData;
    await env.waitForPlayer();
    env.nextRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('verse_1_2');
    env.previousRefButton.nativeElement.click();
    await env.waitForPlayer();
    expect(env.component.audioPlayer.currentRef).toEqual('verse_1_1');
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingScriptureAudioPlayerComponent) audioPlayer!: CheckingScriptureAudioPlayerComponent;
}

class TestEnvironment {
  readonly mockPwaService = mock(PwaService);
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;
  ngZone: NgZone;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingScriptureAudioPlayerComponent, AudioPlayerComponent, AudioTimePipe],
      providers: [{ provide: PwaService, useFactory: () => instance(this.mockPwaService) }],
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

  async waitForPlayer(ms: number = 100): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
