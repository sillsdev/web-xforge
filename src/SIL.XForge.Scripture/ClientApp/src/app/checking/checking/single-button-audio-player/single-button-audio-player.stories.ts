import { Component, ViewChild } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SingleButtonAudioPlayerComponent } from './single-button-audio-player.component';

@Component({
  selector: 'app-audio-player-test',
  template: `<app-single-button-audio-player source="./test-audio-player.webm" #player (click)="togglePlay()">
    <mat-icon>{{ player.playing ? 'stop' : 'play_arrow' }}</mat-icon>
  </app-single-button-audio-player>`,
  imports: [SingleButtonAudioPlayerComponent, MatIcon]
})
class TestComponent {
  @ViewChild('player') player!: SingleButtonAudioPlayerComponent;
  togglePlay(): void {
    this.player.playing ? this.player.stop() : this.player.play();
  }
}

const mockedOnlineStatusService = mock(OnlineStatusService);
when(mockedOnlineStatusService.isOnline).thenReturn(true);
when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(true));

const meta: Meta<SingleButtonAudioPlayerComponent> = {
  title: 'Utility/Single Button Audio Player Component',
  component: TestComponent,
  decorators: [
    moduleMetadata({
      imports: [SingleButtonAudioPlayerComponent, TestComponent],
      providers: [{ provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) }]
    })
  ]
};

export default meta;

type Story = StoryObj<TestComponent>;

export const Default: Story = {};
