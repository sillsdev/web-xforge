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
import { TextDeletedDialogComponent } from './editor/text-deleted-dialog/text-deleted-dialog.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { TranslateRoutingModule } from './translate-routing.module';

@NgModule({
  declarations: [
    EditorComponent,
    MultiViewerComponent,
    NoteDialogComponent,
    SuggestionsComponent,
    SuggestionsSettingsDialogComponent,
    TextDeletedDialogComponent,
    TranslateOverviewComponent
  ],
  imports: [TranslateRoutingModule, CommonModule, SharedModule, UICommonModule, XForgeCommonModule, TranslocoModule]
})
export class TranslateModule {}
