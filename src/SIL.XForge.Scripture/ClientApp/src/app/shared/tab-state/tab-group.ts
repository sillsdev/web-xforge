export class TabGroup<TKey, T> {
  selectedIndex: number = 0;

  constructor(readonly groupId: TKey, readonly tabs: T[] = []) {}

  setTabs(tabs: Iterable<T>): void {
    this.tabs.splice(0, this.tabs.length); // Clear tabs for group
    this.addTabs(tabs);
  }

  addTabs(tabs: Iterable<T>): void {
    for (const tab of tabs) {
      this.addTab(tab, false);
    }
  }

  addTab(tab: T, selectTab: boolean = true): void {
    this.tabs.push(tab);

    if (selectTab) {
      this.selectedIndex = this.tabs.length - 1;
    }
  }

  selectTab(index: number): void {
    this.selectedIndex = index;
  }

  removeTab(index: number): void {
    this.tabs.splice(index, 1);

    // Select preceding tab if removed tab is or is before before the currently selected tab
    if (index <= this.selectedIndex) {
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    }
  }
}
