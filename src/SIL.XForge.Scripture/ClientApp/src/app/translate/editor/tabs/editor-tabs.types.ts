import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { TabInfo } from 'src/app/shared/sf-tab-group';

export interface EditorTabInfo extends TabInfo<EditorTabType> {
  /**
   * If set, only a single instance of this tab is allowed with uniqueness determined by tab type and projectId.
   */
  unique?: boolean;

  /**
   * Whether to persist tab.
   */
  persist?: boolean;

  /**
   * The SF project id if tab is a project/resource tab.
   */
  projectId?: string;
}
