import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { TabGroup } from './tab-group';

export interface TabInfo<TType extends string> {
  type: TType;
  headerText: string;
  icon?: string;
  closeable: boolean;
}

interface TabState<TKey extends string, T> {
  tabGroups$: Observable<Map<TKey, TabGroup<TKey, T>>>;

  addTabGroup(groupId: TKey, tabs: Iterable<T>): void;
  getTabGroup(groupId: TKey): TabGroup<TKey, T> | undefined;
  removeTabGroup(groupId: TKey): boolean;
  clearAllTabGroups(): void;
}

@Injectable({
  providedIn: 'root'
})
export class TabStateService<TKey extends string, T extends TabInfo<string>> implements TabState<TKey, T> {
  protected readonly groups = new Map<TKey, TabGroup<TKey, T>>();

  protected tabGroupsSource$ = new BehaviorSubject<Map<TKey, TabGroup<TKey, T>>>(this.groups);
  tabGroups$: Observable<Map<TKey, TabGroup<TKey, T>>> = this.tabGroupsSource$.asObservable();
  tabs$: Observable<T[]> = this.tabGroupsSource$.pipe(
    map(tabGroups => {
      const tabs: T[] = [];
      tabGroups.forEach(group => {
        tabs.push(...group.tabs);
      });
      return tabs;
    })
  );

  constructor() {}

  addTabGroup(groupId: TKey, tabs: T[]): void {
    if (this.groups.has(groupId)) {
      throw new Error(`Tab group '${groupId}' already exists.`);
    }

    this.groups.set(groupId, new TabGroup(groupId, tabs));
    this.tabGroupsSource$.next(this.groups);
  }

  getTabGroup(groupId: TKey): TabGroup<TKey, T> | undefined {
    return this.groups.get(groupId)!;
  }

  removeTabGroup(groupId: TKey): boolean {
    const itemExisted = this.groups.delete(groupId);
    this.tabGroupsSource$.next(this.groups);
    return itemExisted;
  }

  clearAllTabGroups(): void {
    this.groups.clear();
    this.tabGroupsSource$.next(this.groups);
  }

  addTab(groupId: TKey, tab: T): void {
    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new TabGroup<TKey, T>(groupId, []));
    }

    this.groups.get(groupId)!.addTab(tab, true);
    this.tabGroupsSource$.next(this.groups);
  }

  removeTab(groupId: TKey, index: number): void {
    this.groups.get(groupId)!.removeTab(index);
    this.tabGroupsSource$.next(this.groups);
  }

  selectTab(groupId: TKey, index: number): void {
    this.groups.get(groupId)!.selectedIndex = index;
    this.tabGroupsSource$.next(this.groups);
  }
}
