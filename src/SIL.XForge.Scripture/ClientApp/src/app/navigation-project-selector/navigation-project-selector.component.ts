import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TranslocoModule } from '@ngneat/transloco';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { projectLabel } from '../shared/utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SelectableProject } from '../core/paratext.service';

@Component({
  standalone: true,
  selector: 'app-navigation-project-selector',
  templateUrl: './navigation-project-selector.component.html',
  styleUrls: ['./navigation-project-selector.component.scss'],
  imports: [TranslocoModule, CommonModule, MatDividerModule, MatSelectModule, MatIconModule]
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

  get selectedProjectId(): string | undefined {
    return this.selected?.id;
  }

  projectLabel(doc: SFProjectProfileDoc): string {
    return projectLabel({
      name: doc.data?.name,
      shortName: doc.data?.shortName,
      paratextId: doc.data?.paratextId
    } as SelectableProject);
  }
}
