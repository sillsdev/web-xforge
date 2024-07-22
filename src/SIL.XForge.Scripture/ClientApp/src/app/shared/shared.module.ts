import { CommonModule } from '@angular/common';
import { APP_INITIALIZER, ModuleWithProviders, NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { QuillModule } from 'ngx-quill';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CheckingQuestionComponent } from '../checking/checking/checking-answers/checking-question/checking-question.component';
import { SingleButtonAudioPlayerComponent } from '../checking/checking/single-button-audio-player/single-button-audio-player.component';
import { LynxInsightsModule } from '../translate/editor/lynx/insights/lynx-insights.module';
import { BookChapterChooserComponent } from './book-chapter-chooser/book-chapter-chooser.component';
import { InfoComponent } from './info/info.component';
import { NoticeComponent } from './notice/notice.component';
import { ShareButtonComponent } from './share/share-button.component';
import { ShareControlComponent } from './share/share-control.component';
import { ShareDialogComponent } from './share/share-dialog.component';
import { QuillFormatRegistryService } from './text/quill-editor-registration/quill-format-registry.service';
import { registerScriptureFormats } from './text/quill-editor-registration/quill-registrations';
import { TextDocIdPipe } from './text/text-doc-id.pipe';
import { TextComponent } from './text/text.component';

const componentExports = [
  BookChapterChooserComponent,
  InfoComponent,
  ShareButtonComponent,
  ShareControlComponent,
  ShareDialogComponent,
  TextComponent,
  CheckingQuestionComponent,
  SingleButtonAudioPlayerComponent,
  TextDocIdPipe
];

@NgModule({
  imports: [
    CommonModule,
    QuillModule,
    UICommonModule,
    TranslocoModule,
    NoticeComponent,
    TranslocoMarkupModule,
    LynxInsightsModule
  ],
  declarations: componentExports,
  exports: [...componentExports, NoticeComponent]
})
export class SharedModule {
  static forRoot(): ModuleWithProviders<SharedModule> {
    return {
      ngModule: SharedModule,
      providers: [
        {
          provide: APP_INITIALIZER,
          useFactory: (formatRegistry: QuillFormatRegistryService) => () => {
            registerScriptureFormats(formatRegistry);
          },
          deps: [QuillFormatRegistryService],
          multi: true
        }
      ]
    };
  }
}
