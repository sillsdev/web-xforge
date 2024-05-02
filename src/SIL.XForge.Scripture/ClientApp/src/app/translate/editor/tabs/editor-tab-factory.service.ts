import { Injectable } from '@angular/core';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { TabFactoryService } from 'src/app/shared/sf-tab-group';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabFactoryService implements TabFactoryService<EditorTabType, EditorTabInfo> {
  createTab(tabType: EditorTabType, tabOptions?: Partial<EditorTabInfo>): EditorTabInfo {
    switch (tabType) {
      case 'history':
        return Object.assign(
          {
            type: 'history',
            icon: 'history',
            headerText: 'History',
            closeable: true,
            movable: true,
            persist: true
          },
          tabOptions
        );
      case 'draft':
        return Object.assign(
          {
            type: 'draft',
            icon: 'auto_awesome',
            headerText: 'Auto Draft',
            closeable: true,
            movable: true,
            unique: true
          },
          tabOptions
        );
      case 'project-source':
      case 'project':
        if (!tabOptions?.headerText) {
          throw new Error(`'tabOptions' must include 'headerText'`);
        }

        return Object.assign(
          {
            type: tabType,
            icon: 'book',
            headerText: tabOptions.headerText,
            closeable: false,
            movable: false,
            unique: true
          },
          tabOptions
        );
      default:
        throw new Error(`Unknown TabType: ${tabType}`);
    }
  }
}
