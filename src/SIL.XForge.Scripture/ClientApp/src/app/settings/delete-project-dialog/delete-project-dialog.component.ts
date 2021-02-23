import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { I18nService } from 'xforge-common/i18n.service';
import { SFProjectService } from '../../core/sf-project.service';

@Component({
  templateUrl: 'delete-project-dialog.component.html',
  styleUrls: ['./delete-project-dialog.component.scss']
})
export class DeleteProjectDialogComponent implements OnInit {
  projectNameEntry = new FormControl('');
  isSourceProject: boolean = false;

  constructor(
    @Inject(MDC_DIALOG_DATA) public data: { name: string; projectId: string },
    readonly i18n: I18nService,
    private readonly projectService: SFProjectService
  ) {}

  get deleteDisabled(): boolean {
    return this.data.name?.toLowerCase() !== this.projectNameEntry.value.toLowerCase();
  }

  async ngOnInit(): Promise<void> {
    this.isSourceProject = await this.projectService.onlineIsSourceProject(this.data.projectId);
  }
}
