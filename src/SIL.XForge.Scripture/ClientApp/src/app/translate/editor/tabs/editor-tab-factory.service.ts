import { Injectable } from '@angular/core';
import { isUndefined, omitBy } from 'lodash-es';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { v4 as uuid } from 'uuid';
import { I18nService } from 'xforge-common/i18n.service';
import { TabFactoryService } from '../../../shared/sf-tab-group';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabFactoryService implements TabFactoryService<EditorTabType, EditorTabInfo> {
  constructor(private readonly i18n: I18nService) {}
  createTab(tabType: EditorTabType, tabOptions?: Partial<EditorTabInfo>): EditorTabInfo {
    // Remove undefined options
    tabOptions = omitBy(tabOptions, isUndefined);

    // An id will allow angular to track the tab in the DOM
    const id: string = uuid();

    switch (tabType) {
      case 'biblical-terms':
        return Object.assign(
          {
            id,
            type: 'biblical-terms',
            svgIcon: 'biblical_terms',
            headerText$: this.i18n.translate('editor_tab_factory.default_biblical_terms_tab_header'),
            closeable: true,
            movable: true,
            persist: true,
            unique: true
          },
          tabOptions
        );
      case 'history':
        return Object.assign(
          {
            id,
            type: 'history',
            icon: 'history',
            headerText$: this.i18n.translate('editor_tab_factory.default_history_tab_header'),
            closeable: true,
            movable: true,
            persist: true
          },
          tabOptions
        );
      case 'draft':
        return Object.assign(
          {
            id,
            type: 'draft',
            icon: 'auto_awesome',
            headerText$: this.i18n.translate('editor_tab_factory.draft_tab_header'),
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
            id,
            type: tabType,
            icon: 'book',
            headerText$: this.i18n.translate('editor_tab_factory.default_project_tab_header'),
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
            id,
            type: tabType,
            icon: 'library_books',
            headerText$: this.i18n.translate('editor_tab_factory.default_resource_tab_header'),
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
