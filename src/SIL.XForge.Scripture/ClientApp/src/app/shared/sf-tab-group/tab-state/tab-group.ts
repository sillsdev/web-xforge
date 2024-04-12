export class TabGroup<TKey, T> {
  selectedIndex: number = 0;

  constructor(readonly groupId: TKey, public tabs: ReadonlyArray<T> = []) {}

  setTabs(tabs: Iterable<T>): void {
    this.tabs = [...tabs];
  }

  addTabs(tabs: Iterable<T>): void {
    this.tabs = [...this.tabs, ...tabs];
  }

  addTab(tab: T, selectTab: boolean = true): void {
    this.tabs = [...this.tabs, tab];

    if (selectTab) {
      this.selectedIndex = this.tabs.length - 1;
    }
  }

  removeTab(index: number): void {
    this.tabs = this.tabs.filter((_, i) => i !== index);

    // Select preceding tab if removed tab is or is before before the currently selected tab
    if (index <= this.selectedIndex) {
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    }
  }
}
