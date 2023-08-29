import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayer } from '../../../shared/audio/audio-player';
import { AudioSegmentPlayer } from '../../../shared/audio/audio-segment-player';
import { SingleButtonAudioPlayerComponent } from './single-button-audio-player.component';

const mockedOnlineStatusService = mock(OnlineStatusService);

@Component({
  template: `<app-single-button-audio-player #player [source]="source" [start]="start" [end]="end">
    <mat-icon id="content">play</mat-icon>
  </app-single-button-audio-player>`
})
class MockComponent {
  @ViewChild('player') player!: SingleButtonAudioPlayerComponent;
  source: string;
  start: number | undefined;
  end: number | undefined;
  constructor() {
    this.source = 'test-audio-player.webm';
  }
}

const AlmostDone = 98;

// FIXME Tests are flaky
xdescribe('SingleButtonAudioPlayerComponent', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule],
    declarations: [SingleButtonAudioPlayerComponent, MockComponent],
    providers: [{ provide: OnlineStatusService, useMock: mockedOnlineStatusService }]
  }));

  it('shows content when audio is available', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    expect(env.content).not.toBeNull();
    expect(window.getComputedStyle(env.content.nativeElement)['display']).not.toBe('none');
  });

  it('creates full audio player by default', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    expect(env.component.player.audio instanceof AudioPlayer).toBe(true);
    expect(env.component.player.audio instanceof AudioSegmentPlayer).toBe(false);
  });

  it('creates segment audio player when given range', async () => {
    const env = new TestEnvironment();

    env.component.start = 2;
    env.component.end = 4;

    await env.wait();
    await env.wait();

    expect(env.component.player.audio instanceof AudioSegmentPlayer).toBe(true);
  });

  it('resets when stopped', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    env.component.player.play();

    await env.wait();
    expect(env.component.player.audio?.currentTime).not.toBe(0);

    env.component.player.stop();
    expect(env.component.player.audio?.currentTime).toBe(0);
  });

  it('does not reset when playing finishes', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    env.component.player.audio?.setSeek(AlmostDone);
    await env.wait();
    env.component.player.play();
    await env.wait(1000);

    expect(env.component.player.playing).toBe(false);
    expect(env.component.player.audio?.currentTime).not.toBe(0);
  });

  it('fires first time finished event only once', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    let count = 0;
    env.component.player.hasFinishedPlayingOnce$.subscribe(newVal => {
      if (newVal) {
        count++;
      }
    });

    env.component.player.audio?.setSeek(AlmostDone);
    await env.wait();
    env.component.player.play();
    await env.wait(1000);

    expect(env.component.player.playing).toBe(false);
    expect(count).toBe(1);

    env.component.player.audio?.setSeek(AlmostDone);
    await env.wait();
    env.component.player.play();
    await env.wait(1000);

    expect(env.component.player.playing).toBe(false);
    expect(count).toBe(1);
  });

  it('fires first time finished event as false when input changes', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    let count = 0;
    env.component.player.hasFinishedPlayingOnce$.subscribe(newVal => {
      if (!newVal) {
        count++; //increment only if event fires as false
      }
    });

    expect(count).toBe(1); //called on subscribe

    env.component.source = 'test-audio-player-b.webm';

    await env.wait();
    await env.wait();

    expect(count).toBe(2);
  });

  it('pauses audio when disposed', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();
    env.component.player.play();
    await env.wait();

    expect(env.component.player.playing).toEqual(true);

    env.component.player.audio!.dispose();
    await env.wait();

    expect(env.component.player.playing).toEqual(false);
  });
});

class TestEnvironment {
  readonly component: MockComponent;
  readonly fixture: ComponentFixture<MockComponent>;
  readonly ngZone: NgZone;

  constructor() {
    when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(true));

    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(MockComponent);
    this.component = this.fixture.componentInstance;
  }

  get content(): DebugElement {
    return this.fixture.debugElement.query(By.css('#content'));
  }

  async wait(ms: number = 300): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
