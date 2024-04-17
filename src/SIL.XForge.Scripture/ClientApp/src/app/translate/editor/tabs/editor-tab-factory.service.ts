import { Injectable } from '@angular/core';
import { TabFactoryService } from 'src/app/shared/sf-tab-group';
import { EditorTabInfo, EditorTabType } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabFactoryService implements TabFactoryService<EditorTabType, EditorTabInfo> {
  createTab(tabType: EditorTabType, tabOptions?: Partial<EditorTabInfo>): EditorTabInfo {
    switch (tabType) {
      case 'history':
        return {
          type: 'history',
          icon: 'history',
          headerText: 'History',
          closeable: true,
          movable: true
        };
      case 'draft':
        return {
          type: 'draft',
          icon: 'model_training',
          headerText: 'Auto Draft',
          closeable: true,
          movable: true,
          unique: true
        };
      case 'project-source':
      case 'project':
        if (!tabOptions?.headerText) {
          throw new Error(`'tabOptions' must include 'headerText'`);
        }

        return {
          type: tabType,
          icon: 'book',
          headerText: tabOptions.headerText,
          closeable: false,
          movable: false,
          unique: true
        };
      default:
        throw new Error(`Unknown TabType: ${tabType}`);
    }
  }
}
