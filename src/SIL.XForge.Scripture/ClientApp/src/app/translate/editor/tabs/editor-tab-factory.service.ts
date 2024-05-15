import { Injectable } from '@angular/core';
import { isUndefined, omitBy } from 'lodash-es';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { TabFactoryService } from 'src/app/shared/sf-tab-group';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabFactoryService implements TabFactoryService<EditorTabType, EditorTabInfo> {
  createTab(tabType: EditorTabType, tabOptions?: Partial<EditorTabInfo>): EditorTabInfo {
    // Remove undefined options
    tabOptions = omitBy(tabOptions, isUndefined);

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
            icon: 'model_training',
            headerText: 'Auto Draft',
            closeable: true,
            movable: true,
            unique: true
          },
          tabOptions
        );
      case 'project-source':
      case 'project-target':
        if (!tabOptions?.projectId) {
          throw new Error(`'tabOptions' must include 'projectId'`);
        }

        return Object.assign(
          {
            type: tabType,
            icon: 'book',
            headerText: tabOptions?.headerText ?? 'Project',
            closeable: false,
            movable: false,
            unique: true
          },
          tabOptions
        );
      case 'project-resource':
        if (!tabOptions?.projectId) {
          throw new Error(`'tabOptions' must include 'projectId'`);
        }

        return Object.assign(
          {
            type: tabType,
            icon: 'library_books',
            headerText: tabOptions?.headerText ?? 'Resource',
            closeable: true,
            movable: true,
            unique: false,
            persist: true,
            projectId: tabOptions.projectId
          },
          tabOptions
        );
      default:
        throw new Error(`Unknown TabType: ${tabType}`);
    }
  }
}
