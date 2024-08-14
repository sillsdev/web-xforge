import { TabGroup } from './tab-group';

describe('TabGroup', () => {
  let tabGroup: TabGroup<string, string>;

  beforeEach(() => {
    tabGroup = new TabGroup('testGroup', ['tab1', 'tab2']);
  });

  it('should be created with initial tabs', () => {
    expect(tabGroup.tabs).toEqual(['tab1', 'tab2']);
  });

  it('should set tabs', () => {
    tabGroup.setTabs(['tab3', 'tab4']);
    expect(tabGroup.tabs).toEqual(['tab3', 'tab4']);
  });

  it('should add tabs', () => {
    tabGroup.addTabs(['tab3', 'tab4']);
    expect(tabGroup.tabs).toEqual(['tab1', 'tab2', 'tab3', 'tab4']);
  });

  describe('addTab', () => {
    it('should add a tab', () => {
      tabGroup.addTab('tab3');
      expect(tabGroup.tabs).toEqual(['tab1', 'tab2', 'tab3']);
    });

    it('should select the added tab', () => {
      tabGroup.addTab('tab3');
      expect(tabGroup.selectedIndex).toEqual(2);
    });

    it('should not select the added tab', () => {
      tabGroup.addTab('tab3', false);
      expect(tabGroup.selectedIndex).toEqual(0);
    });

    it('should emit the added tab with selection', () => {
      let addedTabEvent: { tabs: string[]; selectedAddTab?: string } | undefined;
      tabGroup.tabsAdded$.subscribe(event => {
        addedTabEvent = event;
      });
      tabGroup.addTab('tab3');
      expect(addedTabEvent).toEqual({ tabs: ['tab3'], selectedAddTab: 'tab3' });
    });

    it('should not emit the added tab selection if no selection', () => {
      let addedTabEvent: { tabs: string[]; selectedAddTab?: string } | undefined;
      tabGroup.tabsAdded$.subscribe(event => {
        addedTabEvent = event;
      });
      tabGroup.addTab('tab3', false);
      expect(addedTabEvent).toEqual({ tabs: ['tab3'] });
    });
  });

  describe('removeTab', () => {
    it('should remove a tab', () => {
      tabGroup.removeTab(0);
      expect(tabGroup.tabs).toEqual(['tab2']);
    });

    it('should adjust selected index when removing a tab', () => {
      tabGroup.selectedIndex = 1;
      tabGroup.removeTab(0);
      expect(tabGroup.selectedIndex).toEqual(0);
    });

    it('should emit the removed tab', () => {
      let removedTabEvent: { index: number; tab: string } | undefined;
      tabGroup.tabRemoved$.subscribe(event => {
        removedTabEvent = event;
      });
      tabGroup.removeTab(0);
      expect(removedTabEvent).toEqual({ index: 0, tab: 'tab1' });
    });
  });
});
