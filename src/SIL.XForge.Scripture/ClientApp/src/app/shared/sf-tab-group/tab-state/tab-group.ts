import { Subject } from 'rxjs';

export class TabGroup<TKey, T> {
  selectedIndex: number = 0;

  tabsAdded$ = new Subject<{ tabs: T[]; selectedAddTab?: T }>();
  tabRemoved$ = new Subject<{ index: number; tab: T }>();

  constructor(readonly groupId: TKey, public tabs: ReadonlyArray<T> = []) {}

  setTabs(tabs: Iterable<T>): void {
    this.tabs = [...tabs];
  }

  addTabs(tabs: Iterable<T>): void {
    this.tabs = [...this.tabs, ...tabs];
    this.tabsAdded$.next({ tabs: [...tabs] });
  }

  addTab(tab: T, selectTab: boolean = true): void {
    this.tabs = [...this.tabs, tab];

    if (selectTab) {
      this.selectedIndex = this.tabs.length - 1;
    }

    // Only emit the selectedAddTab property if it is defined
    this.tabsAdded$.next({ tabs: [tab], ...(selectTab ? { selectedAddTab: tab } : {}) });
  }

  removeTab(index: number): void {
    const tab = this.tabs[index];
    this.tabs = this.tabs.filter((_, i) => i !== index);

    if (tab != null) {
      this.tabRemoved$.next({ index, tab });
    }

    // Select preceding tab if removed tab is or is before before the currently selected tab
    if (index <= this.selectedIndex) {
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    }
  }
}
