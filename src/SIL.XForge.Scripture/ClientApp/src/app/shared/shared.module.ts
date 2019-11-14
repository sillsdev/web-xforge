import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { QuillModule } from 'ngx-quill';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ChapterNavComponent } from './chapter-nav/chapter-nav.component';
import { ShareControlComponent } from './share/share-control.component';
import { ShareDialogComponent } from './share/share-dialog.component';
import { ShareComponent } from './share/share.component';
import { TextComponent } from './text/text.component';

const componentExports = [
  ChapterNavComponent,
  ShareComponent,
  ShareControlComponent,
  ShareDialogComponent,
  TextComponent
];

@NgModule({
  imports: [CommonModule, QuillModule.forRoot(), UICommonModule, TranslocoModule],
  declarations: componentExports,
  exports: componentExports,
  entryComponents: [ShareDialogComponent]
})
export class SharedModule {}
