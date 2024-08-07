import { Meta } from '@storybook/angular';
import { NoticeService } from 'xforge-common/notice.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { DialogService } from 'xforge-common/dialog.service';
import { AudioRecorderDialogComponent } from './audio-recorder-dialog.component';
import { MatDialogLaunchComponent, matDialogStory } from '../../../../.storybook/util/mat-dialog-launch';

export default {
  title: 'Shared/Audio Recorder',
  component: MatDialogLaunchComponent
} as Meta;

export const Default = matDialogStory(AudioRecorderDialogComponent, {
  imports: [I18nStoryModule],
  providers: [DialogService, NoticeService],
  standaloneComponent: true
});
