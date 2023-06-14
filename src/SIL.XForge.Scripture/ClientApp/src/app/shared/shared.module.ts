import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { QuillModule } from 'ngx-quill';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BookChapterChooserComponent } from './book-chapter-chooser/book-chapter-chooser.component';
import { ChapterNavComponent } from './chapter-nav/chapter-nav.component';
import { InfoComponent } from './info/info.component';
import { NoticeComponent } from './notice/notice.component';
import { ShareButtonComponent } from './share/share-button.component';
import { ShareControlComponent } from './share/share-control.component';
import { ShareDialogComponent } from './share/share-dialog.component';
import { TextComponent } from './text/text.component';

const componentExports = [
  BookChapterChooserComponent,
  ChapterNavComponent,
  InfoComponent,
  NoticeComponent,
  ShareButtonComponent,
  ShareControlComponent,
  ShareDialogComponent,
  TextComponent
];

@NgModule({
  imports: [CommonModule, QuillModule.forRoot(), UICommonModule, TranslocoModule],
  declarations: componentExports,
  exports: componentExports
})
export class SharedModule {}
