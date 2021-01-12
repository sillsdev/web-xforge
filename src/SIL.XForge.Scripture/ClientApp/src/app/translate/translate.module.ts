import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SharedModule } from '../shared/shared.module';
import { EditorComponent } from './editor/editor.component';
import { SuggestionsSettingsDialogComponent } from './editor/suggestions-settings-dialog.component';
import { SuggestionsComponent } from './editor/suggestions.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { TranslateRoutingModule } from './translate-routing.module';

@NgModule({
  declarations: [EditorComponent, SuggestionsComponent, TranslateOverviewComponent, SuggestionsSettingsDialogComponent],
  imports: [TranslateRoutingModule, CommonModule, SharedModule, UICommonModule, TranslocoModule]
})
export class TranslateModule {}
