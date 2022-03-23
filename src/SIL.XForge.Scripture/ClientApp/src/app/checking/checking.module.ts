import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { TranslocoModule } from '@ngneat/transloco';
import { ngfModule } from 'angular-file';
import { AngularSplitModule } from 'angular-split';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { TextChooserDialogComponent } from '../text-chooser-dialog/text-chooser-dialog.component';
import { CheckingOverviewComponent } from './checking-overview/checking-overview.component';
import { CheckingRoutingModule } from './checking-routing.module';
import { CheckingAnswersComponent } from './checking/checking-answers/checking-answers.component';
import { CheckingCommentFormComponent } from './checking/checking-answers/checking-comments/checking-comment-form/checking-comment-form.component';
import { CheckingCommentsComponent } from './checking/checking-answers/checking-comments/checking-comments.component';
import { CheckingAudioCombinedComponent } from './checking/checking-audio-combined/checking-audio-combined.component';
import {
  AudioTimePipe,
  CheckingAudioPlayerComponent
} from './checking/checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking/checking-audio-recorder/checking-audio-recorder.component';
import { CheckingQuestionsComponent } from './checking/checking-questions/checking-questions.component';
import { CheckingTextComponent } from './checking/checking-text/checking-text.component';
import { CheckingComponent } from './checking/checking.component';
import { FontSizeComponent } from './checking/font-size/font-size.component';
import { ImportQuestionsConfirmationDialogComponent } from './import-questions-dialog/import-questions-confirmation-dialog/import-question-confirmation-dialog.component';
import { ImportQuestionsDialogComponent } from './import-questions-dialog/import-questions-dialog.component';
import { QuestionAnsweredDialogComponent } from './question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogComponent } from './question-dialog/question-dialog.component';

@NgModule({
  declarations: [
    CheckingComponent,
    CheckingOverviewComponent,
    CheckingQuestionsComponent,
    CheckingTextComponent,
    CheckingAnswersComponent,
    QuestionDialogComponent,
    ImportQuestionsDialogComponent,
    ImportQuestionsConfirmationDialogComponent,
    FontSizeComponent,
    CheckingCommentsComponent,
    CheckingCommentFormComponent,
    CheckingAudioRecorderComponent,
    CheckingAudioRecorderComponent,
    CheckingAudioPlayerComponent,
    AudioTimePipe,
    CheckingAudioCombinedComponent,
    QuestionAnsweredDialogComponent,
    TextChooserDialogComponent
  ],
  imports: [
    CheckingRoutingModule,
    CommonModule,
    SharedModule,
    UICommonModule,
    XForgeCommonModule,
    AngularSplitModule.forChild(),
    ngfModule,
    TranslocoModule
  ],
  exports: [CheckingAudioRecorderComponent, CheckingAudioPlayerComponent]
})
export class CheckingModule {}
