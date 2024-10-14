import { CommonModule } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SingleButtonAudioPlayerComponent } from './single-button-audio-player.component';

@Component({
  selector: 'app-audio-player-test',
  template: `<app-single-button-audio-player source="./test-audio-player.webm" #player (click)="togglePlay()">
    <mat-icon>{{ player.playing ? 'stop' : 'play_arrow' }}</mat-icon>
  </app-single-button-audio-player>`
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
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      providers: [
        {
          provide: OnlineStatusService,
          useValue: instance(mockedOnlineStatusService)
        }
      ],
      declarations: [SingleButtonAudioPlayerComponent, TestComponent]
    })
  ]
};

export default meta;

type Story = StoryObj<TestComponent>;

export const Default: Story = {};
