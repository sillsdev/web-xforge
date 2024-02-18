import { Component, ContentChildren, EventEmitter, Input, Output, QueryList } from '@angular/core';
import { TabHeaderMouseEvent } from './sf-tabs.types';
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
  @Output() tabSelect = new EventEmitter<number>();
  @Output() newTabRequest = new EventEmitter<string | null>();
  @Output() closeTabRequest = new EventEmitter<number>();

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

  onTabCloseRequest(tabIndex: number): void {
    this.removeTab(tabIndex);
  }

  onTabAddRequest(newTabType: string | null): void {
    this.newTabRequest.emit(newTabType);
  }

  selectTab(tabIndex: number): void {
    this.selectedIndex = tabIndex;
    this.tabSelect.emit(tabIndex);
  }

  removeTab(tabIndex: number): void {
    if (this.isTabRemovable(tabIndex)) {
      this.closeTabRequest.emit(tabIndex);
    }
  }

  isTabRemovable(tabIndex: number): boolean {
    return tabIndex > 0 && tabIndex < this.tabs.length;
  }
}
