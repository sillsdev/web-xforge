import { TestBed } from '@angular/core/testing';
import { of, take } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { TabGroup } from './tab-group';
import { TabInfo, TabStateService } from './tab-state.service';

describe('TabStateService', () => {
  let service: TabStateService<string, TabInfo<string>>;
  const groupId = 'testGroup';
  const tabs: TabInfo<string>[] = [
    { id: uuid(), type: 'tab1', headerText$: of('Tab 1'), closeable: true, movable: true },
    { id: uuid(), type: 'tab2', headerText$: of('Tab 2'), closeable: false, movable: true }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TabStateService]
    });
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
          { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true }
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

  describe('getFirstTabOfTypeIndex', () => {
    it('should return the group and index of the first tab of the given type', () => {
      const groupId1: string = 'group1';
      const groupId2: string = 'group2';
      const tabs1: TabInfo<string>[] = [
        { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
        { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true }
      ];
      const tabs2: TabInfo<string>[] = [
        { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true },
        { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true }
      ];
      service['groups'].set(groupId1, new TabGroup<string, any>(groupId1, tabs1));
      service['groups'].set(groupId2, new TabGroup<string, any>(groupId2, tabs2));

      expect(service.getFirstTabOfTypeIndex('type-a')).toEqual({ groupId: groupId1, index: 0 });
      expect(service.getFirstTabOfTypeIndex('type-a', groupId2)).toEqual({ groupId: groupId2, index: 1 });
    });

    it('should return undefined if no tab of the given type is found', () => {
      const groupId1: string = 'group1';
      const groupId2: string = 'group2';
      const tabs: TabInfo<string>[] = [
        { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
        { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true }
      ];
      service['groups'].set(groupId1, new TabGroup<string, any>(groupId1, tabs));
      service['groups'].set(groupId2, new TabGroup<string, any>(groupId2, tabs));

      const result = service.getFirstTabOfTypeIndex('type-c');
      expect(result).toEqual(undefined);
    });
  });

  describe('tab actions', () => {
    it('should add a tab', () => {
      const groupId: string = 'source';
      const tab: TabInfo<string> = {
        id: uuid(),
        type: 'type-a',
        headerText$: of('Header'),
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
        id: uuid(),
        type: 'type-a',
        headerText$: of('Header'),
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
          id: uuid(),
          type: 'type-a',
          headerText$: of('Header 1'),
          closeable: true,
          movable: true
        },
        {
          id: uuid(),
          type: 'type-a',
          headerText$: of('Header 2'),
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
          { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true },
          { id: uuid(), type: 'type-c', headerText$: of('Header 3'), closeable: true, movable: true }
        ];
        service['groups'].set(groupId, new TabGroup<string, any>(groupId, tabs));
        service.moveTab({ groupId, index: 0 }, { groupId, index: 2 });
        expect(service['groups'].get(groupId)!.tabs.map(tab => tab.type)).toEqual(['type-b', 'type-c', 'type-a']);
      });

      it('should update selected index when moving a tab within the same group', () => {
        const groupId: string = 'source';
        const tabs: TabInfo<string>[] = [
          { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true },
          { id: uuid(), type: 'type-c', headerText$: of('Header 3'), closeable: true, movable: true }
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
          { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true }
        ];
        const toTabs: TabInfo<string>[] = [
          { id: uuid(), type: 'type-c', headerText$: of('Header 3'), closeable: true, movable: true },
          { id: uuid(), type: 'type-d', headerText$: of('Header 4'), closeable: true, movable: true }
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
          { id: uuid(), type: 'type-a', headerText$: of('Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 2'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 3'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Header 4'), closeable: true, movable: true }
        ];
        const toTabs: TabInfo<string>[] = [
          { id: uuid(), type: 'type-c', headerText$: of('Header 3'), closeable: true, movable: true },
          { id: uuid(), type: 'type-d', headerText$: of('Header 4'), closeable: true, movable: true }
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

    describe('tab consolidation', () => {
      let sourceTabs: TabInfo<string>[];
      let targetTabs: TabInfo<string>[];

      beforeEach(() => {
        sourceTabs = [
          { id: uuid(), type: 'type-a', headerText$: of('Source Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Source Header 2'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Source Header 3'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Source Header 4'), closeable: true, movable: true }
        ];

        targetTabs = [
          { id: uuid(), type: 'type-a', headerText$: of('Target Header 1'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Target Header 2'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Target Header 3'), closeable: true, movable: true },
          { id: uuid(), type: 'type-b', headerText$: of('Target Header 4'), closeable: true, movable: true }
        ];

        service['groups'].set('source', new TabGroup<string, any>('source', sourceTabs));
        service['groups'].set('target', new TabGroup<string, any>('target', targetTabs));
      });

      it('should consolidate tab groups', () => {
        const targetGroupSelectedIndex = 1;
        service['groups'].get('target')!.selectedIndex = targetGroupSelectedIndex;

        expect(service['lastConsolidationGroupId']).toBeUndefined();
        expect(service['tabsToDeconsolidate']).toBeUndefined();

        service.consolidateTabGroups('target');

        expect(service['groups'].get('source')?.tabs).toEqual([]);
        expect(service['groups'].get('target')?.tabs).toEqual(sourceTabs.concat(targetTabs));
        expect(service['groups'].get('target')?.selectedIndex).toBe(sourceTabs.length + targetGroupSelectedIndex);
        expect(service['lastConsolidationGroupId']).toBe('target');
        expect(service['tabsToDeconsolidate']?.size).toBe(1);
        expect(service['tabsToDeconsolidate']?.get('source')).toEqual(sourceTabs);
      });

      it('should remove tab from restore list if tab is removed from consolidated group', () => {
        service.consolidateTabGroups('target');
        expect(service['tabsToDeconsolidate']?.get('source')).toEqual(sourceTabs);

        service['groups'].get('target')?.removeTab(3);
        expect(service['tabsToDeconsolidate']?.get('source')).toEqual(sourceTabs.slice(0, 3));
      });

      it('should add tabs to restore list and consolidated group when tabs are added after consolidation and before deconsolidation', () => {
        const tabsToAdd: TabInfo<string>[] = [
          {
            id: uuid(),
            type: 'type-c',
            headerText$: of('added source Source Header 5'),
            closeable: true,
            movable: true
          },
          {
            id: uuid(),
            type: 'type-c',
            headerText$: of('added source Source Header 6'),
            closeable: true,
            movable: true
          }
        ];

        service.consolidateTabGroups('target');
        const selectedIndex = service['groups'].get('target')!.selectedIndex;

        service['groups'].get('source')?.addTabs(tabsToAdd);
        expect(service['tabsToDeconsolidate']?.get('source')).toEqual(sourceTabs.concat(tabsToAdd));
        expect(service['groups'].get('source')?.tabs).toEqual([]);
        expect(service['groups'].get('target')?.tabs).toEqual([...sourceTabs, ...tabsToAdd, ...targetTabs]);
        expect(service['groups'].get('target')?.selectedIndex).toEqual(selectedIndex + tabsToAdd.length);
      });

      it('should select added tab when tab with selection is added after consolidation and before deconsolidation', () => {
        const tabToAdd: TabInfo<string> = {
          id: uuid(),
          type: 'type-c',
          headerText$: of('added source Source Header 5'),
          closeable: true,
          movable: true
        };

        service.consolidateTabGroups('target');
        service['groups'].get('source')?.addTab(tabToAdd);
        const targetGroup = service['groups'].get('target');

        expect(service['tabsToDeconsolidate']?.get('source')).toEqual(sourceTabs.concat(tabToAdd));
        expect(targetGroup?.selectedIndex).toEqual(targetGroup?.tabs.indexOf(tabToAdd));
      });

      it('should deconsolidate tab groups', () => {
        service.consolidateTabGroups('target');
        expect(service['lastConsolidationGroupId']).toBeDefined();
        expect(service['tabsToDeconsolidate']).toBeDefined();
        expect(service['groups'].get('source')?.tabs).toEqual([]);
        expect(service['groups'].get('target')?.tabs).toEqual(sourceTabs.concat(targetTabs));

        service.deconsolidateTabGroups();
        expect(service['lastConsolidationGroupId']).toBeUndefined();
        expect(service['tabsToDeconsolidate']).toBeUndefined();
        expect(service['groups'].get('source')?.tabs).toEqual(sourceTabs);
        expect(service['groups'].get('target')?.tabs).toEqual(targetTabs);
        expect(service['groups'].get('source')?.selectedIndex).toBe(0);
      });
    });
  });
});
