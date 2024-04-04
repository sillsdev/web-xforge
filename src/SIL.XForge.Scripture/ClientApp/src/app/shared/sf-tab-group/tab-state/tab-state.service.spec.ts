import { TestBed } from '@angular/core/testing';
import { take } from 'rxjs';
import { TabGroup } from './tab-group';
import { TabInfo, TabStateService } from './tab-state.service';

describe('TabStateService', () => {
  let service: TabStateService<string, TabInfo<string>>;
  const groupId = 'testGroup';
  const tabs: TabInfo<string>[] = [
    { type: 'tab1', headerText: 'Tab 1', closeable: true, movable: true },
    { type: 'tab2', headerText: 'Tab 2', closeable: false, movable: true }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TabStateService);
  });

  describe('group actions', () => {
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

    describe('clearAllTabGroups', () => {
      it('should clear all tab groups and emit an empty map after clearing all tab groups', done => {
        const groupId1: string = 'group1';
        const groupId2: string = 'group2';
        const tabs: TabInfo<string>[] = [
          { type: 'type-a', headerText: 'Header 1', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 2', closeable: true, movable: true }
        ];
        service['groups'].set(groupId1, new TabGroup<string, any>(groupId1, tabs));
        service['groups'].set(groupId2, new TabGroup<string, any>(groupId2, tabs));
        service.tabGroups$.pipe(take(1)).subscribe(groups => {
          expect(groups.size).toBe(2);
        });
        service.clearAllTabGroups();
        expect(service['groups'].size).toBe(0);
        service.tabGroups$.pipe(take(1)).subscribe(groups => {
          expect(groups.size).toBe(0);
          done();
        });
      });
    });
  });

  describe('tab actions', () => {
    it('should add a tab', () => {
      const groupId: string = 'source';
      const tab: TabInfo<string> = {
        type: 'type-a',
        headerText: 'Header',
        closeable: true,
        movable: true
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
        closeable: true,
        movable: true
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
          closeable: true,
          movable: true
        },
        {
          type: 'type-a',
          headerText: 'Header 2',
          closeable: true,
          movable: true
        }
      ];
      service['groups'].set(groupId, new TabGroup<string, any>(groupId, tabs));
      service.selectTab(groupId, 1);
      expect(service['groups'].get(groupId)!.selectedIndex).toBe(1);
    });

    describe('moveTab', () => {
      it('should move a tab within the same group', () => {
        const groupId: string = 'source';
        const tabs: TabInfo<string>[] = [
          { type: 'type-a', headerText: 'Header 1', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 2', closeable: true, movable: true },
          { type: 'type-c', headerText: 'Header 3', closeable: true, movable: true }
        ];
        service['groups'].set(groupId, new TabGroup<string, any>(groupId, tabs));
        service.moveTab({ groupId, index: 0 }, { groupId, index: 2 });
        expect(service['groups'].get(groupId)!.tabs.map(tab => tab.type)).toEqual(['type-b', 'type-c', 'type-a']);
      });

      it('should update selected index when moving a tab within the same group', () => {
        const groupId: string = 'source';
        const tabs: TabInfo<string>[] = [
          { type: 'type-a', headerText: 'Header 1', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 2', closeable: true, movable: true },
          { type: 'type-c', headerText: 'Header 3', closeable: true, movable: true }
        ];
        const group = new TabGroup<string, any>(groupId, tabs);
        service['groups'].set(groupId, group);

        group.selectedIndex = 0;
        service.moveTab({ groupId, index: 0 }, { groupId, index: 2 });
        expect(service['groups'].get(groupId)!.selectedIndex).toBe(2);

        group.selectedIndex = 1;
        service.moveTab({ groupId, index: 0 }, { groupId, index: 2 });
        expect(service['groups'].get(groupId)!.selectedIndex).toBe(0);

        group.selectedIndex = 1;
        service.moveTab({ groupId, index: 1 }, { groupId, index: 2 });
        expect(service['groups'].get(groupId)!.selectedIndex).toBe(2);

        group.selectedIndex = 1;
        service.moveTab({ groupId, index: 2 }, { groupId, index: 1 });
        expect(service['groups'].get(groupId)!.selectedIndex).toBe(2);
      });

      it('should move a tab across groups', () => {
        const fromGroupId: string = 'source';
        const toGroupId: string = 'target';
        const fromTabs: TabInfo<string>[] = [
          { type: 'type-a', headerText: 'Header 1', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 2', closeable: true, movable: true }
        ];
        const toTabs: TabInfo<string>[] = [
          { type: 'type-c', headerText: 'Header 3', closeable: true, movable: true },
          { type: 'type-d', headerText: 'Header 4', closeable: true, movable: true }
        ];
        service['groups'].set(fromGroupId, new TabGroup<string, any>(fromGroupId, fromTabs));
        service['groups'].set(toGroupId, new TabGroup<string, any>(toGroupId, toTabs));
        service.moveTab({ groupId: fromGroupId, index: 0 }, { groupId: toGroupId, index: 1 });
        expect(service['groups'].get(fromGroupId)!.tabs.map(tab => tab.type)).toEqual(['type-b']);
        expect(service['groups'].get(toGroupId)!.tabs.map(tab => tab.type)).toEqual(['type-c', 'type-a', 'type-d']);
      });

      it('should update selected index when moving a tab across groups', () => {
        const fromGroupId: string = 'source';
        const toGroupId: string = 'target';
        const fromTabs: TabInfo<string>[] = [
          { type: 'type-a', headerText: 'Header 1', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 2', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 3', closeable: true, movable: true },
          { type: 'type-b', headerText: 'Header 4', closeable: true, movable: true }
        ];
        const toTabs: TabInfo<string>[] = [
          { type: 'type-c', headerText: 'Header 3', closeable: true, movable: true },
          { type: 'type-d', headerText: 'Header 4', closeable: true, movable: true }
        ];
        const fromGroup = new TabGroup<string, any>(fromGroupId, fromTabs);
        const toGroup = new TabGroup<string, any>(toGroupId, toTabs);

        service['groups'].set(fromGroupId, fromGroup);
        service['groups'].set(toGroupId, toGroup);

        fromGroup.selectedIndex = 0;
        toGroup.selectedIndex = 1;
        service.moveTab({ groupId: fromGroupId, index: 0 }, { groupId: toGroupId, index: 1 });
        expect(service['groups'].get(fromGroupId)!.selectedIndex).toBe(0);
        expect(service['groups'].get(toGroupId)!.selectedIndex).toBe(1);

        fromGroup.selectedIndex = 2;
        toGroup.selectedIndex = 2;
        service.moveTab({ groupId: fromGroupId, index: 2 }, { groupId: toGroupId, index: 1 });
        expect(service['groups'].get(fromGroupId)!.selectedIndex).toBe(1);
        expect(service['groups'].get(toGroupId)!.selectedIndex).toBe(1);
      });
    });
  });
});
