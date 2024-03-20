import { Component, ContentChild, Input, TemplateRef, ViewChild } from '@angular/core';
import { TabHeaderDirective } from '../tab-header/tab-header.directive';

@Component({
  selector: 'app-tab',
  templateUrl: './tab.component.html',
  styleUrls: ['./tab.component.scss']
})
export class TabComponent {
  @Input() closeable: boolean = true;
  @ViewChild(TemplateRef) contentTemplate!: TemplateRef<any>;
  @ContentChild(TabHeaderDirective, { read: TemplateRef }) tabHeaderTemplate?: any;
}
