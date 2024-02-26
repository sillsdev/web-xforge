import {
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  QueryList,
  SimpleChanges
} from '@angular/core';
import { TabStateService } from '../tab-state/tab-state.service';
import { TabHeaderMouseEvent } from './sf-tabs.types';
import { TabComponent } from './tab/tab.component';

@Component({
  selector: 'app-tab-group',
  templateUrl: './tab-group.component.html',
  styleUrls: ['./tab-group.component.scss']
})
export class TabGroupComponent implements OnChanges {
  @Input() groupId: string = '';
  @Input() selectedIndex = 0;
  @Output() newTabRequest = new EventEmitter<string | null>();

  @ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;

  constructor(private readonly tabState: TabStateService<string, any>) {}

  ngOnChanges(changes: SimpleChanges): void {
    const indexChange = changes.selectedIndex;

    if (indexChange && indexChange.currentValue !== indexChange.previousValue) {
      this.selectTab(indexChange.currentValue);
    }
  }

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

  onTabAddRequest(newTabType: string | null): void {
    this.newTabRequest.emit(newTabType);
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

  isTabRemovable(tabIndex: number): boolean {
    return tabIndex > 0 && tabIndex < this.tabs.length;
  }
}
