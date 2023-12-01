import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { QuillModule } from 'ngx-quill';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CheckingQuestionComponent } from '../checking/checking/checking-answers/checking-question/checking-question.component';
import { SingleButtonAudioPlayerComponent } from '../checking/checking/single-button-audio-player/single-button-audio-player.component';
import { BookChapterChooserComponent } from './book-chapter-chooser/book-chapter-chooser.component';
import { InfoComponent } from './info/info.component';
import { NoticeComponent } from './notice/notice.component';
import { ShareButtonComponent } from './share/share-button.component';
import { ShareControlComponent } from './share/share-control.component';
import { ShareDialogComponent } from './share/share-dialog.component';
import { TextComponent } from './text/text.component';
import { WorkingAnimatedIndicatorComponent } from './working-animated-indicator/working-animated-indicator.component';

const componentExports = [
  BookChapterChooserComponent,
  InfoComponent,
  ShareButtonComponent,
  ShareControlComponent,
  ShareDialogComponent,
  TextComponent,
  CheckingQuestionComponent,
  SingleButtonAudioPlayerComponent,
  WorkingAnimatedIndicatorComponent
];

@NgModule({
  imports: [CommonModule, QuillModule.forRoot(), UICommonModule, TranslocoModule, NoticeComponent],
  declarations: componentExports,
  exports: [...componentExports, NoticeComponent]
})
export class SharedModule {}
