import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { projectLabel } from '../shared/utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SelectableProject } from '../core/paratext.service';

@Component({
  selector: 'app-navigation-project-selector',
  templateUrl: './navigation-project-selector.component.html',
  styleUrls: ['./navigation-project-selector.component.scss']
})
export class NavigationProjectSelectorComponent {
  @Output() changed: EventEmitter<string> = new EventEmitter<string>();
  @Input() projectDocs?: SFProjectProfileDoc[];
  @Input() selected?: SFProjectProfileDoc;
  constructor(readonly i18n: I18nService, private readonly onlineStatusService: OnlineStatusService) {}

  get hasProjects(): boolean {
    return this.projectDocs != null && this.projectDocs.length > 0;
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  projectLabel(doc: SFProjectProfileDoc): string {
    return projectLabel({
      name: doc.data?.name,
      shortName: doc.data?.shortName,
      paratextId: doc.data?.paratextId
    } as SelectableProject);
  }

  get selectedProjectId(): string | undefined {
    return this.selected?.id;
  }
}
