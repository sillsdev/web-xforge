import { BidiModule } from '@angular/cdk/bidi';
import { OverlayModule } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { APP_INITIALIZER, ModuleWithProviders, NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeModule } from '@angular/material/tree';
import { TranslocoModule } from '@ngneat/transloco';
import { IncludesPipe } from 'xforge-common/includes.pipe';
import { QuillFormatRegistryService } from '../../../../shared/text/quill-editor-registration/quill-format-registry.service';
import { EditorReadyService } from './base-services/editor-ready.service';
import { EditorSegmentService } from './base-services/editor-segment.service';
import { InsightRenderService } from './base-services/insight-render.service';
import { InsightCodePipe } from './insight-code.pipe';
import { LynxInsightActionPromptComponent } from './lynx-insight-action-prompt/lynx-insight-action-prompt.component';
import { LynxInsightEditorObjectsComponent } from './lynx-insight-editor-objects/lynx-insight-editor-objects.component';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';
import { LynxInsightScrollPositionIndicatorComponent } from './lynx-insight-scroll-position-indicator/lynx-insight-scroll-position-indicator.component';
import { LynxInsightStatusIndicatorComponent } from './lynx-insight-status-indicator/lynx-insight-status-indicator.component';
import { LynxInsightUserEventService } from './lynx-insight-user-event.service';
import { LynxInsightsPanelHeaderComponent } from './lynx-insights-panel/lynx-insights-panel-header/lynx-insights-panel-header.component';
import { LynxInsightsPanelComponent } from './lynx-insights-panel/lynx-insights-panel.component';
import { lynxInsightBlots } from './quill-services/blots/lynx-insight-blot';
import { QuillEditorReadyService } from './quill-services/quill-editor-ready.service';
import { QuillEditorSegmentService } from './quill-services/quill-editor-segment.service';
import { QuillInsightRenderService } from './quill-services/quill-insight-render.service';

@NgModule({
  declarations: [
    LynxInsightActionPromptComponent,
    LynxInsightEditorObjectsComponent,
    LynxInsightsPanelComponent,
    LynxInsightsPanelHeaderComponent,
    LynxInsightOverlayComponent,
    LynxInsightScrollPositionIndicatorComponent,
    LynxInsightStatusIndicatorComponent,
    InsightCodePipe
  ],
  imports: [
    CommonModule,
    BidiModule,
    TranslocoModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatRippleModule,
    MatTabsModule,
    MatTooltipModule,
    MatTreeModule,
    OverlayModule,
    IncludesPipe
  ],
  exports: [LynxInsightEditorObjectsComponent, LynxInsightsPanelComponent, InsightCodePipe]
})
export class LynxInsightsModule {
  static forRoot(): ModuleWithProviders<LynxInsightsModule> {
    return {
      ngModule: LynxInsightsModule,
      providers: [
        {
          provide: APP_INITIALIZER,
          useFactory: () => () => {},
          deps: [LynxInsightUserEventService],
          multi: true
        },
        {
          provide: APP_INITIALIZER,
          useFactory: (formatRegistry: QuillFormatRegistryService) => () => {
            formatRegistry.registerFormats(lynxInsightBlots);
          },
          deps: [QuillFormatRegistryService],
          multi: true
        },
        { provide: EditorReadyService, useClass: QuillEditorReadyService },
        { provide: InsightRenderService, useClass: QuillInsightRenderService },
        { provide: EditorSegmentService, useClass: QuillEditorSegmentService }
      ]
    };
  }
}
