import { TestBed } from '@angular/core/testing';
import { TabGroup } from './tab-group';
import { TabInfo, TabStateService } from './tab-state.service';

describe('TabStateService', () => {
  let service: TabStateService<string, TabInfo<string>>;
  const groupId = 'testGroup';
  const tabs: TabInfo<string>[] = [
    { type: 'tab1', headerText: 'Tab 1', closeable: true },
    { type: 'tab2', headerText: 'Tab 2', closeable: false }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TabStateService);
  });

  it('should add a new tab group', () => {
    service.addTabGroup(groupId, tabs);
    expect(service['groups'].get(groupId)).toEqual(new TabGroup(groupId, tabs));
  });

  it('should throw an error if the group already exists', () => {
    service.addTabGroup(groupId, tabs);
    expect(() => service.addTabGroup(groupId, tabs)).toThrowError(`Tab group '${groupId}' already exists.`);
  });

  it('should emit the updated groups', done => {
    service.addTabGroup(groupId, tabs);
    service.tabGroups$.subscribe(groups => {
      expect(groups.get(groupId)).toEqual(new TabGroup(groupId, tabs));
      done();
    });
  });

  it('should remove a tab group', () => {
    service.addTabGroup(groupId, tabs);
    service.removeTabGroup(groupId);
    expect(service['groups'].get(groupId)).toBeUndefined();
  });

  describe('tab actions', () => {
    it('should add a tab', () => {
      const groupId: string = 'source';
      const tab: TabInfo<string> = {
        type: 'type-a',
        headerText: 'Header',
        closeable: true
      };
      service.addTab(groupId, tab);
      expect(service['groups'].get(groupId)!.tabs.length).toBe(1);
      expect(service['groups'].get(groupId)!.tabs[0]).toEqual(tab);
    });

    it('should remove a tab', () => {
      const groupId: string = 'source';
      const tab: TabInfo<string> = {
        type: 'type-a',
        headerText: 'Header',
        closeable: true
      };
      service['groups'].set(groupId, new TabGroup<string, any>(groupId, [tab]));
      expect(service['groups'].get(groupId)!.tabs.length).toBe(1);
      service.removeTab(groupId, 0);
      expect(service['groups'].get(groupId)!.tabs.length).toBe(0);
    });

    it('should select a tab', () => {
      const groupId: string = 'source';
      const tabs: TabInfo<string>[] = [
        {
          type: 'type-a',
          headerText: 'Header 1',
          closeable: true
        },
        {
          type: 'type-a',
          headerText: 'Header 2',
          closeable: true
        }
      ];
      service['groups'].set(groupId, new TabGroup<string, any>(groupId, tabs));
      service.selectTab(groupId, 1);
      expect(service['groups'].get(groupId)!.selectedIndex).toBe(1);
    });
  });
});
