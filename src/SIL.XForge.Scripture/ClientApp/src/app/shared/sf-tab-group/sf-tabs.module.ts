import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { CustomIconModule } from '../custom-icon.module';
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
    CustomIconModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
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
