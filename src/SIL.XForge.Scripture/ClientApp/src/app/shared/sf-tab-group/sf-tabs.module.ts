import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { NoopTabAddRequestService, TabAddRequestService } from './base-services/tab-add-request.service';
import { TabGroupHeaderComponent } from './tab-group-header/tab-group-header.component';
import { TabScrollButtonComponent } from './tab-group-header/tab-scroll-button/tab-scroll-button.component';
import { TabGroupComponent } from './tab-group.component';
import { TabHeaderComponent } from './tab-header/tab-header.component';
import { TabHeaderDirective } from './tab-header/tab-header.directive';
import { TabBodyComponent } from './tab/tab-body/tab-body.component';
import { TabComponent } from './tab/tab.component';

@NgModule({
  imports: [
    CommonModule,
    MatButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    DragDropModule,
    TranslocoModule,
    TabGroupComponent,
    TabComponent,
    TabHeaderComponent,
    TabHeaderDirective,
    TabGroupHeaderComponent,
    TabScrollButtonComponent,
    TabBodyComponent
  ],
  exports: [TabGroupComponent, TabComponent, TabHeaderDirective],
  providers: [{ provide: TabAddRequestService, useClass: NoopTabAddRequestService }]
})
export class SFTabsModule {}
