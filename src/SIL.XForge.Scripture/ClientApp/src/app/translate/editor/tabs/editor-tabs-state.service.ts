import { Injectable } from '@angular/core';
import { TabGroup } from '../../../shared/tab-state/tab-group';
import { TabStateService } from '../../../shared/tab-state/tab-state.service';
import { EditorTabFactoryService } from './editor-tab-factory.service';
import { EditorTabGroupType, EditorTabInfo, EditorTabType } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabsStateService extends TabStateService<EditorTabGroupType, EditorTabInfo> {
  constructor(private readonly tabFactory: EditorTabFactoryService) {
    super();
  }

  addTab(groupId: EditorTabGroupType, tab: EditorTabInfo): void;
  addTab(groupId: EditorTabGroupType, tabType: EditorTabType): void;
  addTab(groupId: EditorTabGroupType, tabInfoOrTabType: EditorTabInfo | EditorTabType): void {
    let tab: EditorTabInfo;

    if (typeof tabInfoOrTabType === 'string') {
      tab = this.tabFactory.createEditorTab(tabInfoOrTabType);
    } else {
      tab = tabInfoOrTabType;
    }

    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new TabGroup<EditorTabGroupType, EditorTabInfo>(groupId, []));
    }

    this.groups.get(groupId)!.addTab(tab, true);
    this.tabGroupsSource$.next(this.groups);
  }

  removeTab(groupId: EditorTabGroupType, index: number): void {
    this.groups.get(groupId)!.removeTab(index);
    this.tabGroupsSource$.next(this.groups);
  }

  selectTab(groupId: EditorTabGroupType, index: number): void {
    this.groups.get(groupId)!.selectedIndex = index;
    this.tabGroupsSource$.next(this.groups);
  }
}
