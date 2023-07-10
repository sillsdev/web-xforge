import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { HttpClient } from '../machine-api/http-client';
import { EditorComponent } from './editor/editor.component';
import { MultiViewerComponent } from './editor/multi-viewer/multi-viewer.component';
import { NoteDialogComponent } from './editor/note-dialog/note-dialog.component';
import { SuggestionsSettingsDialogComponent } from './editor/suggestions-settings-dialog.component';
import { SuggestionsComponent } from './editor/suggestions.component';
import { TrainingProgressComponent } from './training-progress/training-progress.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { TranslateRoutingModule } from './translate-routing.module';
import { DraftGenerationComponent } from './draft-generation/draft-generation.component';
import { DraftViewerComponent } from './draft-generation/draft-viewer/draft-viewer.component';
import { MockPreTranslationHttpClient } from './draft-generation/mock-pretranslation-machine-api';
import { DRAFT_GENERATION_SERVICE_OPTIONS } from './draft-generation/draft-generation';

@NgModule({
  declarations: [
    EditorComponent,
    MultiViewerComponent,
    NoteDialogComponent,
    SuggestionsComponent,
    SuggestionsSettingsDialogComponent,
    TrainingProgressComponent,
    TranslateOverviewComponent,
    DraftGenerationComponent,
    DraftViewerComponent
  ],
  imports: [TranslateRoutingModule, CommonModule, SharedModule, UICommonModule, XForgeCommonModule, TranslocoModule],
  providers: [
    // TODO: remove these once machine api pretranslation endpoints are present
    { provide: HttpClient, useClass: MockPreTranslationHttpClient },
    { provide: DRAFT_GENERATION_SERVICE_OPTIONS, useValue: { pollRate: 200 } }
  ]
})
export class TranslateModule {}
