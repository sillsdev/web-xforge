import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoModule } from '@ngneat/transloco';
import { TabGroupHeaderComponent } from './tab-group-header/tab-group-header.component';
import { TabScrollButtonComponent } from './tab-group-header/tab-scroll-button/tab-scroll-button.component';
import { TabGroupComponent } from './tab-group.component';
import { TabHeaderComponent } from './tab-header/tab-header.component';
import { TabHeaderDirective } from './tab-header/tab-header.directive';
import { TabBodyComponent } from './tab/tab-body/tab-body.component';
import { TabComponent } from './tab/tab.component';

@NgModule({
  declarations: [
    TabGroupComponent,
    TabComponent,
    TabHeaderComponent,
    TabHeaderDirective,
    TabGroupHeaderComponent,
    TabScrollButtonComponent,
    TabBodyComponent
  ],
  imports: [
    CommonModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    DragDropModule,
    TranslocoModule
  ],
  exports: [TabGroupComponent, TabComponent, TabHeaderDirective]
})
export class SFTabsModule {}
