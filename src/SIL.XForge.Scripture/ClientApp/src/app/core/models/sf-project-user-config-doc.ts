import { EditorTabPersistData } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab-persist-data';
import {
  SF_PROJECT_USER_CONFIG_INDEX_PATHS,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class SFProjectUserConfigDoc extends ProjectDataDoc<SFProjectUserConfig> {
  static readonly COLLECTION = SF_PROJECT_USER_CONFIGS_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECT_USER_CONFIG_INDEX_PATHS;

  async updateEditorOpenTabs(tabs: EditorTabPersistData[]): Promise<void> {
    if (this.data == null) {
      return;
    }

    await this.submitJson0Op(op => {
      op.set(puc => puc.editorTabsOpen, tabs);
    });
  }

  /** Add a tab to the list of persisted tabs if it does not already exist. */
  async addTab(tab: EditorTabPersistData): Promise<void> {
    if (this.data == null) {
      return;
    }

    if (this.data.editorTabsOpen.some(t => t.groupId === tab.groupId && t.tabType === tab.tabType)) {
      return;
    }

    await this.submitJson0Op(op => {
      op.add(puc => puc.editorTabsOpen, tab);
    });
  }
}
