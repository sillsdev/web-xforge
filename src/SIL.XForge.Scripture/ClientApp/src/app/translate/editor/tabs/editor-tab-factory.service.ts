import { Injectable } from '@angular/core';
import { isUndefined, omitBy } from 'lodash-es';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { firstValueFrom } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { TabFactoryService } from '../../../shared/sf-tab-group';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabFactoryService implements TabFactoryService<EditorTabType, EditorTabInfo> {
  constructor(private readonly i18n: I18nService) {}
  async createTab(tabType: EditorTabType, tabOptions?: Partial<EditorTabInfo>): Promise<EditorTabInfo> {
    // Remove undefined options
    tabOptions = omitBy(tabOptions, isUndefined);

    switch (tabType) {
      case 'history':
        return Object.assign(
          {
            type: 'history',
            icon: 'history',
            headerText: await firstValueFrom(this.i18n.translate('editor_tab_factory.default_history_tab_header')),
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
            headerText: await firstValueFrom(this.i18n.translate('editor_tab_factory.draft_tab_header')),
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
            headerText: await firstValueFrom(this.i18n.translate('editor_tab_factory.default_project_tab_header')),
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
            headerText: await firstValueFrom(this.i18n.translate('editor_tab_factory.default_resource_tab_header')),
            closeable: true,
            movable: true,
            unique: false,
            persist: true
          },
          tabOptions
        );
      default:
        throw new Error(`Unknown TabType: ${tabType}`);
    }
  }
}
