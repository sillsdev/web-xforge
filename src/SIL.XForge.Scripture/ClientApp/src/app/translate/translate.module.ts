import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { AngularSplitModule } from 'angular-split';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { CopyrightBannerComponent } from '../shared/copyright-banner/copyright-banner.component';
import { SFTabsModule } from '../shared/sf-tab-group';
import { SharedModule } from '../shared/shared.module';
import { BiblicalTermDialogComponent } from './biblical-terms/biblical-term-dialog.component';
import { BiblicalTermsComponent } from './biblical-terms/biblical-terms.component';
import { DraftApplyProgressDialogComponent } from './draft-generation/draft-apply-progress-dialog/draft-apply-progress-dialog.component';
import { DraftPreviewBooksComponent } from './draft-generation/draft-preview-books/draft-preview-books.component';
import { EditorDraftComponent } from './editor/editor-draft/editor-draft.component';
import { EditorHistoryComponent } from './editor/editor-history/editor-history.component';
import { HistoryChooserComponent } from './editor/editor-history/history-chooser/history-chooser.component';
import { HistoryRevisionFormatPipe } from './editor/editor-history/history-chooser/history-revision-format.pipe';
import { EditorResourceComponent } from './editor/editor-resource/editor-resource.component';
import { EditorComponent } from './editor/editor.component';
import { LynxInsightsModule } from './editor/lynx/insights/lynx-insights.module';
import { MultiViewerComponent } from './editor/multi-viewer/multi-viewer.component';
import { NoteDialogComponent } from './editor/note-dialog/note-dialog.component';
import { SuggestionsSettingsDialogComponent } from './editor/suggestions-settings-dialog.component';
import { SuggestionsComponent } from './editor/suggestions.component';
import { EditorTabAddResourceDialogComponent } from './editor/tabs/editor-tab-add-resource-dialog/editor-tab-add-resource-dialog.component';
import { FontUnsupportedMessageComponent } from './font-unsupported-message/font-unsupported-message.component';
import { TrainingProgressComponent } from './training-progress/training-progress.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { TranslateRoutingModule } from './translate-routing.module';

@NgModule({
  declarations: [
    BiblicalTermDialogComponent,
    EditorComponent,
    MultiViewerComponent,
    NoteDialogComponent,
    SuggestionsComponent,
    SuggestionsSettingsDialogComponent,
    TrainingProgressComponent,
    TranslateOverviewComponent,
    HistoryChooserComponent,
    EditorHistoryComponent,
    EditorDraftComponent,
    HistoryRevisionFormatPipe,
    EditorTabAddResourceDialogComponent,
    EditorResourceComponent
  ],
  imports: [
    AngularSplitModule,
    TranslateRoutingModule,
    CommonModule,
    SharedModule,
    UICommonModule,
    XForgeCommonModule,
    TranslocoModule,
    TranslocoMarkupModule,
    AvatarComponent,
    SFTabsModule,
    BiblicalTermsComponent,
    CopyrightBannerComponent,
    DraftPreviewBooksComponent,
    DraftApplyProgressDialogComponent,
    FontUnsupportedMessageComponent,
    LynxInsightsModule
  ]
})
export class TranslateModule {}
