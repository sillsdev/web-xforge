import {
  Component,
  ContentChildren,
  ElementRef,
  Input,
  OnChanges,
  QueryList,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { take } from 'rxjs';
import { TabAddRequestService } from './base-services/tab-add-request.service';
import { TabFactoryService } from './base-services/tab-factory.service';
import { TabHeaderPointerEvent, TabMoveEvent } from './sf-tabs.types';
import { TabStateService } from './tab-state/tab-state.service';
import { TabBodyComponent } from './tab/tab-body/tab-body.component';
import { TabComponent } from './tab/tab.component';

@Component({
    selector: 'app-tab-group [groupId]',
    templateUrl: './tab-group.component.html',
    styleUrls: ['./tab-group.component.scss'],
    standalone: false
})
export class TabGroupComponent implements OnChanges {
  @Input() groupId: string = '';
  @Input() selectedIndex = 0;
  @Input() allowDragDrop = true;
  @Input() connectedTo: string[] = [];

  @ViewChild(TabBodyComponent, { read: ElementRef })
  scrollContainer?: ElementRef<HTMLElement>;
  @ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;

  constructor(
    private readonly tabState: TabStateService<string, any>,
    private readonly tabFactory: TabFactoryService<string, any>,
    private readonly tabAddRequestService: TabAddRequestService<string, any>
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    const indexChange = changes.selectedIndex;

    if (indexChange && indexChange.currentValue !== indexChange.previousValue) {
      this.selectTab(indexChange.currentValue);
    }
  }

  onTabHeaderPress(e: TabHeaderPointerEvent): void {
    // Select tab on left mouse button press or mobile touch
    if (this.isTouchEvent(e.pointerEvent) || e.pointerEvent.button === 0) {
      if (e.index < this.tabs.length) {
        this.selectTab(e.index);
      }
    }
  }

  onTabHeaderClick(e: TabHeaderPointerEvent): void {
    // Close tab on middle mouse button click
    if (e.pointerEvent instanceof MouseEvent && e.pointerEvent.button === 1) {
      this.removeTab(e.index);
      return;
    }
  }

  onTabAddRequest(newTabType: string): void {
    // Some tabs types may need further processing before they can be added (e.g. 'project-resource')
    this.tabAddRequestService
      .handleTabAddRequest(newTabType)
      .pipe(take(1))
      .subscribe(tabOptions => {
        this.addTab(newTabType, tabOptions);
      });
  }

  addTab(newTabType: string, tabOptions: any = {}): void {
    const tab = this.tabFactory.createTab(newTabType, tabOptions);
    this.tabState.addTab(this.groupId, tab);
  }

  selectTab(tabIndex: number): void {
    this.selectedIndex = tabIndex;
    this.tabState.selectTab(this.groupId, tabIndex);
  }

  removeTab(tabIndex: number): void {
    if (this.isTabRemovable(tabIndex)) {
      this.tabState.removeTab(this.groupId, tabIndex);
    }
  }

  moveTab(e: TabMoveEvent<string>): void {
    this.tabState.moveTab(e.from, e.to);
  }

  isTabRemovable(tabIndex: number): boolean {
    return this.tabs.get(tabIndex)?.closeable ?? false;
  }

  private isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
    return window.TouchEvent != null && event instanceof TouchEvent;
  }
}
