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

  it('should add a tab', () => {
    tabGroup.addTab('tab3');
    expect(tabGroup.tabs).toEqual(['tab1', 'tab2', 'tab3']);
  });

  it('should select a tab', () => {
    tabGroup.selectTab(1);
    expect(tabGroup.selectedIndex).toEqual(1);
  });

  it('should remove a tab', () => {
    tabGroup.removeTab(0);
    expect(tabGroup.tabs).toEqual(['tab2']);
  });

  it('should adjust selected index when removing a tab', () => {
    tabGroup.selectTab(1);
    tabGroup.removeTab(0);
    expect(tabGroup.selectedIndex).toEqual(0);
  });
});
