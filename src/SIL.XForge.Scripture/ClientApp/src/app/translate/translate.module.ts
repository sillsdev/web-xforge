import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { EditorComponent } from './editor/editor.component';
import { MultiViewerComponent } from './editor/multi-viewer/multi-viewer.component';
import { NoteDialogComponent } from './editor/note-dialog/note-dialog.component';
import { SuggestionsSettingsDialogComponent } from './editor/suggestions-settings-dialog.component';
import { SuggestionsComponent } from './editor/suggestions.component';
import { TrainingProgressComponent } from './training-progress/training-progress.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { TranslateRoutingModule } from './translate-routing.module';
import { GenerateDraftComponent } from './generate-draft/generate-draft.component';
import { DraftViewerComponent } from './generate-draft/draft-viewer/draft-viewer.component';
import { DraftGenerationService } from './generate-draft/draft-generation.service';
import { MockDraftGenerationService } from './generate-draft/draft-generation.mock.service';

@NgModule({
  declarations: [
    EditorComponent,
    MultiViewerComponent,
    NoteDialogComponent,
    SuggestionsComponent,
    SuggestionsSettingsDialogComponent,
    TrainingProgressComponent,
    TranslateOverviewComponent,
    GenerateDraftComponent,
    DraftViewerComponent
  ],
  imports: [TranslateRoutingModule, CommonModule, SharedModule, UICommonModule, XForgeCommonModule, TranslocoModule],
  providers: [
    // TODO - remove once machine api pretranslation endpoints are present
    { provide: DraftGenerationService, useClass: MockDraftGenerationService }
  ]
})
export class TranslateModule {}
