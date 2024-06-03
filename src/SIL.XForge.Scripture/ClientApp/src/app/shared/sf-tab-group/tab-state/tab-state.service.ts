import { Injectable } from '@angular/core';
import { isEqual } from 'lodash-es';
import { BehaviorSubject, distinctUntilChanged, map, Observable } from 'rxjs';
import { moveItemInReadonlyArray, transferItemAcrossReadonlyArrays } from 'xforge-common/util/array-util';
import { TabLocation } from '../sf-tabs.types';
import { TabGroup } from './tab-group';

export type FlatTabInfo<TGroupId extends string, T extends TabInfo<string>> = T & {
  groupId: TGroupId;
  isSelected: boolean;
};

export interface TabInfo<TType extends string> {
  type: TType;
  headerText: string;

  /** Optional text to display on hover of the tab header. */
  tooltip?: string;

  /** Optional material icon to place alongside tab header text. */
  icon?: string;

  /** Whether the tab can be removed from the tab group. */
  closeable: boolean;

  /** Whether the tab can be dragged or reordered. */
  movable: boolean;
}

@Injectable()
export class TabStateService<TGroupId extends string, T extends TabInfo<string>> {
  protected readonly groups = new Map<TGroupId, TabGroup<TGroupId, T>>();
  protected tabGroupsSource$ = new BehaviorSubject<Map<TGroupId, TabGroup<TGroupId, T>>>(this.groups);

  tabGroups$: Observable<Map<TGroupId, TabGroup<TGroupId, T>>> = this.tabGroupsSource$.asObservable();

  tabs$: Observable<FlatTabInfo<TGroupId, T>[]> = this.tabGroupsSource$.pipe(
    map(tabGroups => {
      const tabs: FlatTabInfo<TGroupId, T>[] = [];
      tabGroups.forEach(group => {
        group.tabs.forEach((tab, index) => {
          tabs.push({
            ...tab,
            groupId: group.groupId,
            isSelected: group.selectedIndex === index
          });
        });
      });
      return tabs;
    }),
    distinctUntilChanged(isEqual)
  );

  groupIds$: Observable<TGroupId[]> = this.tabGroupsSource$.pipe(map(groups => Array.from(groups.keys())));

  constructor() {}

  setTabGroups(tabGroups: TabGroup<TGroupId, T>[]): void {
    this.groups.clear();
    tabGroups.forEach(group => this.groups.set(group.groupId, group));
    this.tabGroupsSource$.next(this.groups);
  }

  addTabGroup(groupId: TGroupId, tabs: T[]): void;
  addTabGroup(tabGroup: TabGroup<TGroupId, T>): void;
  addTabGroup(groupIdOrGroup: TGroupId | TabGroup<TGroupId, T>, tabs?: T[]): void {
    if (groupIdOrGroup instanceof TabGroup) {
      const tabGroup: TabGroup<TGroupId, T> = groupIdOrGroup;
      this.groups.set(tabGroup.groupId, tabGroup);
      return;
    }

    const groupId = groupIdOrGroup;

    if (this.groups.has(groupId)) {
      throw new Error(`Tab group '${groupId}' already exists.`);
    }

    this.groups.set(groupId, new TabGroup(groupId, tabs));
    this.tabGroupsSource$.next(this.groups);
  }

  getTabGroup(groupId: TGroupId): TabGroup<TGroupId, T> | undefined {
    return this.groups.get(groupId)!;
  }

  removeTabGroup(groupId: TGroupId): boolean {
    const itemExisted = this.groups.delete(groupId);
    this.tabGroupsSource$.next(this.groups);
    return itemExisted;
  }

  clearAllTabGroups(): void {
    this.groups.clear();
    this.tabGroupsSource$.next(this.groups);
  }

  addTab(groupId: TGroupId, tab: T, selectTab: boolean = true): void {
    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new TabGroup<TGroupId, T>(groupId, []));
    }

    this.groups.get(groupId)!.addTab(tab, selectTab);
    this.tabGroupsSource$.next(this.groups);
  }

  /**
   * Returns the group and index of the first tab of the given type. If no tab is found, returns undefined.
   * @param type The type of the tab to find.
   * @param groupId The group to search in. If not provided, searches all groups.
   */
  getFirstTabOfTypeIndex(type: string, groupId?: TGroupId): { groupId: TGroupId; index: number } | undefined {
    if (groupId == null) {
      for (const [groupId, group] of this.groups) {
        const index = group.tabs.findIndex(tab => tab.type === type);

        if (index !== -1) {
          return { groupId, index };
        }
      }

      return undefined;
    }

    const index: number | undefined = this.groups.get(groupId)?.tabs?.findIndex(t => t.type === type);

    if (index == null || index === -1) {
      return undefined;
    }

    return { groupId, index };
  }

  hasTab(groupId: TGroupId, type: string): boolean {
    const group = this.groups.get(groupId);
    return group != null && group.tabs.some(t => t.type === type);
  }

  removeTab(groupId: TGroupId, index: number): void {
    this.groups.get(groupId)!.removeTab(index);
    this.tabGroupsSource$.next(this.groups);
  }

  selectTab(groupId: TGroupId, index: number): void {
    this.groups.get(groupId)!.selectedIndex = index;
    this.tabGroupsSource$.next(this.groups);
  }

  moveTab(from: TabLocation<TGroupId>, to: TabLocation<TGroupId>): void {
    const fromGroup: TabGroup<TGroupId, T> | undefined = this.groups.get(from.groupId);

    if (fromGroup) {
      // Tab move within same group
      if (from.groupId === to.groupId) {
        // Add bounds in case tab is dropped after 'add tab'
        to.index = Math.min(fromGroup.tabs.length - 1, to.index);

        fromGroup.tabs = moveItemInReadonlyArray(fromGroup.tabs, from.index, to.index);

        // Update selected tab index if necessary
        if (from.index === fromGroup.selectedIndex) {
          // Selected tab moved
          fromGroup.selectedIndex = to.index;
        } else if (from.index < fromGroup.selectedIndex && to.index >= fromGroup.selectedIndex) {
          // Tab before selected tab moved after selected tab
          fromGroup.selectedIndex--;
        } else if (from.index > fromGroup.selectedIndex && to.index <= fromGroup.selectedIndex) {
          // Tab after selected tab moved before selected tab
          fromGroup.selectedIndex++;
        }
      } else {
        // Tab move across groups
        const toGroup: TabGroup<TGroupId, T> | undefined = this.groups.get(to.groupId);

        if (toGroup) {
          // 'to.index' can be out of bounds if dropped after 'add tab'
          const toIndex: number = Math.min(to.index, toGroup.tabs.length);

          const [fromArr, toArr] = transferItemAcrossReadonlyArrays(fromGroup.tabs, toGroup.tabs, from.index, toIndex);
          fromGroup.tabs = fromArr;
          toGroup.tabs = toArr;

          // Update 'from group' selected tab index if necessary
          if (from.index <= fromGroup.selectedIndex) {
            fromGroup.selectedIndex = Math.max(0, fromGroup.selectedIndex - 1);
          }

          // 'to group' selected tab is the newly added tab
          toGroup.selectedIndex = toIndex;
        }
      }
    }
  }
}
