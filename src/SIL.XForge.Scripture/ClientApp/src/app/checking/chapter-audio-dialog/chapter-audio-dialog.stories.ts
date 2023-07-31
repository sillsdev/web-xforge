import { MatDialogLaunchComponent, matDialogStory } from '.storybook/story-utils';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Meta } from '@storybook/angular';
import { BookChapterChooserComponent } from 'src/app/shared/book-chapter-chooser/book-chapter-chooser.component';
import { CsvService } from 'xforge-common/csv-service.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { CheckingAudioCombinedComponent } from '../checking/checking-audio-combined/checking-audio-combined.component';
import { ChapterAudioDialogComponent, ChapterAudioDialogData } from './chapter-audio-dialog.component';

const meta: Meta = {
  title: 'Chapter Audio',
  component: MatDialogLaunchComponent
};
export default meta;

export const Default = matDialogStory(
  ChapterAudioDialogComponent,
  [I18nStoryModule, NoopAnimationsModule],
  [BookChapterChooserComponent, CheckingAudioCombinedComponent],
  [{ provide: CsvService, useValue: undefined }]
);
const confirmationData: ChapterAudioDialogData = {
  projectId: 'ASDF1234',
  textsByBookId: {
    ['GEN']: {
      bookNum: 1,
      chapters: [
        { isValid: true, number: 1, hasAudio: false, lastVerse: 23, permissions: {} },
        { isValid: true, number: 2, hasAudio: false, lastVerse: 55, permissions: {} }
      ],
      hasSource: false,
      permissions: {}
    },
    ['EXO']: {
      bookNum: 2,
      chapters: [{ isValid: true, number: 4, hasAudio: true, lastVerse: 33, permissions: {} }],
      hasSource: false,
      permissions: {}
    }
  }
};
Default.args = { data: confirmationData };
