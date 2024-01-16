import { TestBed } from '@angular/core/testing';
import { TabGroup } from '../../../shared/tab-state/tab-group';
import { EditorTabFactoryService } from './editor-tab-factory.service';
import { EditorTabsStateService } from './editor-tabs-state.service';
import { EditorTabGroupType, EditorTabInfo } from './editor-tabs.types';

describe('EditorTabsStateService', () => {
  let service: EditorTabsStateService;
  let tabFactory: EditorTabFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EditorTabFactoryService]
    });
    tabFactory = TestBed.inject(EditorTabFactoryService);
    service = TestBed.inject(EditorTabsStateService);
  });

  it('should add a tab', () => {
    const groupId: EditorTabGroupType = 'source';
    const tab = tabFactory.createEditorTab('history');
    service.addTab(groupId, 'history');
    expect(service['groups'].get(groupId)!.tabs.length).toBe(1);
    expect(service['groups'].get(groupId)!.tabs[0]).toEqual(tab);
  });

  it('should remove a tab', () => {
    const groupId: EditorTabGroupType = 'source';
    const tab = tabFactory.createEditorTab('history');
    service['groups'].set(groupId, new TabGroup<EditorTabGroupType, EditorTabInfo>(groupId, [tab]));
    expect(service['groups'].get(groupId)!.tabs.length).toBe(1);
    service.removeTab(groupId, 0);
    expect(service['groups'].get(groupId)!.tabs.length).toBe(0);
  });

  it('should select a tab', () => {
    const groupId: EditorTabGroupType = 'source';
    service['groups'].set(
      groupId,
      new TabGroup<EditorTabGroupType, EditorTabInfo>(groupId, [
        tabFactory.createEditorTab('history'),
        tabFactory.createEditorTab('history')
      ])
    );
    service.selectTab(groupId, 1);
    expect(service['groups'].get(groupId)!.selectedIndex).toBe(1);
  });
});
