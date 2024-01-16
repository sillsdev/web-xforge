import { Component, ContentChildren, EventEmitter, Input, Output, QueryList } from '@angular/core';
import { TabEvent, TabEventType, TabHeaderMouseEvent } from './sf-tabs.types';
import { TabComponent } from './tab/tab.component';

@Component({
  selector: 'app-tab-group',
  templateUrl: './tab-group.component.html',
  styleUrls: ['./tab-group.component.scss']
})
export class TabGroupComponent {
  @Input() groupId: string = '';
  @Input() selectedIndex = 0;
  @Input() showAddTab = true;
  @Input() showAddTabMenu = true;
  @Output() tabSelect = new EventEmitter<TabEvent>();
  @Output() newTabRequest = new EventEmitter<string | null>();
  @Output() closeTabRequest = new EventEmitter<TabEvent>();

  @ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;

  onTabHeaderClick(e: TabHeaderMouseEvent): void {
    // Close tab on middle button click
    if (e.mouseEvent.button === 1) {
      this.removeTab(e.index);
      return;
    }

    if (e.index < this.tabs.length) {
      this.selectTab(e.index);
    }
  }

  onTabCloseRequest(e: TabEvent): void {
    this.removeTab(e.index);
  }

  onTabAddRequest(newTabType: string | null): void {
    this.newTabRequest.emit(newTabType);
  }

  selectTab(tabIndex: number): void {
    this.selectedIndex = tabIndex;
    this.tabSelect.emit({ index: tabIndex, type: TabEventType.Select });
  }

  removeTab(tabIndex: number): void {
    if (this.isTabRemovable(tabIndex)) {
      this.closeTabRequest.emit({ index: tabIndex, type: TabEventType.Close });
    }
  }

  isTabRemovable(tabIndex: number): boolean {
    return tabIndex > 0 && tabIndex < this.tabs.length;
  }
}
