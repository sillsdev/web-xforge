import { Component, ContentChild, Input, TemplateRef, ViewChild } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { TabHeaderDirective } from '../tab-header/tab-header.directive';

@Component({
    selector: 'app-tab',
    templateUrl: './tab.component.html',
    styleUrls: ['./tab.component.scss'],
    standalone: false
})
export class TabComponent {
  @Input() closeable: boolean = true;
  @Input() movable: boolean = true;
  @Input() tooltip?: string;
  @ViewChild(TemplateRef) contentTemplate!: TemplateRef<any>;
  @ContentChild(TabHeaderDirective, { read: TemplateRef }) tabHeaderTemplate?: any;

  // An id will allow angular to track the tab in the DOM
  readonly id: string = uuid();
}
