import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioTimePipe, CheckingAudioPlayerComponent } from './checking-audio-player.component';

describe('CheckingAudioPlayerComponent', () => {
  let env: TestEnvironment;
  let audioFile: string;
  let audioFileB: string;

  beforeEach(() => {
    env = new TestEnvironment();
    audioFile = 'test-audio-player.webm';
    audioFileB = 'test-audio-player-b.webm';
  });

  it('should be created', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    await env.createHostComponent(template);
    expect(env.component.player1.enabled).toBe(true);
    expect(env.duration).toBe('0:05');
    expect(env.currentTime).toBe('0:00');
  });

  it('can play', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    await env.createHostComponent(template);
    env.clickButton(env.playButton(1));
    await env.waitForPlayer(1500);
    env.fixture.detectChanges();
    env.clickButton(env.pauseButton(1));
    expect(env.currentTime).toBe('0:01');
  });

  it('plays and pauses the other playing audio', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' +
      audioFile +
      '"></app-checking-audio-player>' +
      '<app-checking-audio-player #player2 id="player2" source="' +
      audioFileB +
      '"></app-checking-audio-player>';
    await env.createHostComponent(template);
    env.clickButton(env.playButton(1));
    await env.waitForPlayer(500);
    expect(env.component.player1.isPlaying).toBe(true);
    env.clickButton(env.playButton(2));
    await env.waitForPlayer(500);
    expect(env.component.player1.isPlaying).toBe(false);
    env.clickButton(env.pauseButton(2));
    expect(env.component.player2.isPlaying).toBe(false);
  });

  it('disables the audio player when audio is reset', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    await env.createHostComponent(template);
    expect(env.component.player1.hasSource).toBe(true);
    env.component.player1.source = '';
    expect(env.component.player1.hasSource).toBe(false);
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingAudioPlayerComponent, { static: false }) player1: CheckingAudioPlayerComponent;
  @ViewChild(CheckingAudioPlayerComponent, { static: false }) player2: CheckingAudioPlayerComponent;
}

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      imports: [UICommonModule]
    });
  }

  get duration(): string {
    return this.fixture.debugElement.query(By.css('.duration')).nativeElement.textContent;
  }

  get currentTime(): string {
    return this.fixture.debugElement.query(By.css('.current-time')).nativeElement.textContent;
  }

  get moreMenuButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.more-menu'));
  }
  get downloadButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.download'));
  }

  playButton(num: number): DebugElement {
    const id = num === 1 ? '#player1' : '#player2';
    return this.fixture.debugElement.query(By.css(id + ' .play'));
  }

  pauseButton(num: number): DebugElement {
    const id = num === 1 ? '#player1' : '#player2';
    return this.fixture.debugElement.query(By.css(id + ' .pause'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  async createHostComponent(template: string) {
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    await this.waitForPlayer(1000);
    this.fixture.detectChanges();
  }

  async waitForPlayer(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
    this.fixture.detectChanges();
  }
}
