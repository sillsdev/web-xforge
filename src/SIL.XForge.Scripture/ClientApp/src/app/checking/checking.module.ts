import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { ngfModule } from 'angular-file';
import { AngularSplitModule } from 'angular-split';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { AudioPlayerComponent } from '../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../shared/audio/audio-time-pipe';
import { SharedModule } from '../shared/shared.module';
import { TextChooserDialogComponent } from '../text-chooser-dialog/text-chooser-dialog.component';
import { AttachAudioComponent } from './attach-audio/attach-audio.component';
import { ChapterAudioDialogComponent } from './chapter-audio-dialog/chapter-audio-dialog.component';
import { CheckingOverviewComponent } from './checking-overview/checking-overview.component';
import { CheckingRoutingModule } from './checking-routing.module';
import { CheckingAnswersComponent } from './checking/checking-answers/checking-answers.component';
import { CheckingCommentsComponent } from './checking/checking-answers/checking-comments/checking-comments.component';
import { CheckingInputFormComponent } from './checking/checking-answers/checking-input-form/checking-input-form.component';
import { CheckingAudioPlayerComponent } from './checking/checking-audio-player/checking-audio-player.component';
import { CheckingQuestionsComponent } from './checking/checking-questions/checking-questions.component';
import { CheckingScriptureAudioPlayerComponent } from './checking/checking-scripture-audio-player/checking-scripture-audio-player.component';
import { CheckingTextComponent } from './checking/checking-text/checking-text.component';
import { CheckingComponent } from './checking/checking.component';
import { FontSizeComponent } from './checking/font-size/font-size.component';
import { ImportQuestionsConfirmationDialogComponent } from './import-questions-dialog/import-questions-confirmation-dialog/import-questions-confirmation-dialog.component';
import { ImportQuestionsDialogComponent } from './import-questions-dialog/import-questions-dialog.component';
import { QuestionDialogComponent } from './question-dialog/question-dialog.component';
import { TextAndAudioComponent } from './text-and-audio/text-and-audio.component';

@NgModule({
  declarations: [
    CheckingComponent,
    CheckingOverviewComponent,
    CheckingQuestionsComponent,
    CheckingTextComponent,
    CheckingAnswersComponent,
    TextAndAudioComponent,
    AttachAudioComponent,
    QuestionDialogComponent,
    ImportQuestionsDialogComponent,
    ImportQuestionsConfirmationDialogComponent,
    FontSizeComponent,
    CheckingCommentsComponent,
    CheckingInputFormComponent,
    CheckingAudioPlayerComponent,
    AudioPlayerComponent,
    CheckingScriptureAudioPlayerComponent,
    AudioTimePipe,
    TextChooserDialogComponent,
    ChapterAudioDialogComponent
  ],
  imports: [
    CheckingRoutingModule,
    CommonModule,
    SharedModule,
    UICommonModule,
    XForgeCommonModule,
    OwnerComponent,
    AngularSplitModule,
    ngfModule,
    TranslocoModule
  ],
  exports: [CheckingAudioPlayerComponent]
})
export class CheckingModule {}
