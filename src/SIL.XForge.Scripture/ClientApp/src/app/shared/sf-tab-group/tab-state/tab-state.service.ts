import { moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { TabLocation } from '../sf-tabs.types';
import { TabGroup } from './tab-group';

export interface TabInfo<TType extends string> {
  type: TType;
  headerText: string;

  /** Optional material icon to place alongside tab header text. */
  icon?: string;

  /** Whether the tab can be removed from the tab group. */
  closeable: boolean;

  /** Whether the tab can be dragged or reordered. */
  movable: boolean;
}

interface TabState<TGroupId extends string, T> {
  tabGroups$: Observable<Map<TGroupId, TabGroup<TGroupId, T>>>;

  addTabGroup(groupId: TGroupId, tabs: Iterable<T>): void;
  getTabGroup(groupId: TGroupId): TabGroup<TGroupId, T> | undefined;
  removeTabGroup(groupId: TGroupId): boolean;
  clearAllTabGroups(): void;
}

@Injectable({
  providedIn: 'root'
})
export class TabStateService<TGroupId extends string, T extends TabInfo<string>> implements TabState<TGroupId, T> {
  protected readonly groups = new Map<TGroupId, TabGroup<TGroupId, T>>();

  protected tabGroupsSource$ = new BehaviorSubject<Map<TGroupId, TabGroup<TGroupId, T>>>(this.groups);
  tabGroups$: Observable<Map<TGroupId, TabGroup<TGroupId, T>>> = this.tabGroupsSource$.asObservable();

  tabs$: Observable<T[]> = this.tabGroupsSource$.pipe(
    map(tabGroups => {
      const tabs: T[] = [];
      tabGroups.forEach(group => {
        tabs.push(...group.tabs);
      });
      return tabs;
    })
  );

  groupIds$: Observable<TGroupId[]> = this.tabGroupsSource$.pipe(map(groups => Array.from(groups.keys())));

  constructor() {}

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

  addTab(groupId: TGroupId, tab: T): void {
    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new TabGroup<TGroupId, T>(groupId, []));
    }

    this.groups.get(groupId)!.addTab(tab, true);
    this.tabGroupsSource$.next(this.groups);
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

        moveItemInArray(fromGroup.tabs, from.index, to.index);

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
          transferArrayItem(fromGroup.tabs, toGroup.tabs, from.index, to.index);

          // Update 'from group' selected tab index if necessary
          if (from.index <= fromGroup.selectedIndex) {
            fromGroup.selectedIndex = Math.max(0, fromGroup.selectedIndex - 1);
          }

          // 'to group' selected tab is the newly added tab
          toGroup.selectedIndex = to.index;
        }
      }
    }

    this.tabGroupsSource$.next(this.groups);
  }
}
