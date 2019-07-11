import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, DebugElement, ViewChild } from '@angular/core';
import { By } from '@angular/platform-browser';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioTimePipe, CheckingAudioPlayerComponent } from './checking-audio-player.component';

describe('CheckingAudioPlayerComponent', () => {
  let env: TestEnvironment;
  let audioFile: string;

  beforeEach(() => {
    env = new TestEnvironment();
    audioFile = 'test-audio-player.webm';
  });

  it('should be created', async () => {
    const template = '<app-checking-audio-player #player source="' + audioFile + '"></app-checking-audio-player>';
    await env.createHostComponent(template);
    expect(env.fixture.componentInstance.player.enabled).toBe(true);
    expect(env.duration).toBe('0:05');
    expect(env.currentTime).toBe('0:00');
  });

  it('can play', async () => {
    const template =
      '<app-checking-audio-player #player source="' +
      audioFile +
      '" [downloadable]="true"></app-checking-audio-player>';
    await env.createHostComponent(template);
    // env.clickButton(env.moreMenuButton);
    // await env.waitForPlayer(1500);
    env.clickButton(env.playButton);
    await env.waitForPlayer(1500);
    env.fixture.detectChanges();
    env.clickButton(env.pauseButton);
    expect(env.currentTime).toBe('0:01');
  });

  it('can enable download', async () => {
    const template = '<app-checking-audio-player #player source="' + audioFile + '"></app-checking-audio-player>';
    await env.createHostComponent(template);
    expect(env.moreMenuButton).toBeFalsy();
    env.fixture.componentInstance.player.downloadable = true;
    env.fixture.detectChanges();
    expect(env.moreMenuButton).toBeTruthy();
    env.clickButton(env.moreMenuButton);
    expect(env.downloadButton).toBeTruthy();
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingAudioPlayerComponent) player: CheckingAudioPlayerComponent;
}

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      imports: [UICommonModule]
    });
  }

  get playButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.play'));
  }

  get pauseButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.pause'));
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

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  async createHostComponent(template: string) {
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
    await this.waitForPlayer(1000);
    this.fixture.detectChanges();
  }

  async waitForPlayer(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
    this.fixture.detectChanges();
  }
}
