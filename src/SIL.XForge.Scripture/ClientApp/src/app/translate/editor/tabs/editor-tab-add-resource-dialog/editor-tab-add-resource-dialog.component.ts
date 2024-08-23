import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { map, repeat, take, timer } from 'rxjs';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { SelectableProject } from '../../../../core/paratext.service';
import { PermissionsService } from '../../../../core/permissions.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { EditorTabAddResourceDialogService } from './editor-tab-add-resource-dialog.service';

export interface EditorTabAddResourceDialogData {
  excludedParatextIds: string[];
}

@Component({
  selector: 'app-editor-tab-add-resource-dialog',
  templateUrl: './editor-tab-add-resource-dialog.component.html',
  styleUrls: ['./editor-tab-add-resource-dialog.component.scss']
})
export class EditorTabAddResourceDialogComponent implements OnInit {
  projects?: ParatextProject[];
  resources?: SelectableProject[];

  selectedProjectDoc?: SFProjectDoc;

  projectLoadingFailed = false;
  resourceLoadingFailed = false;

  isLoading = false;
  isSyncActive = false;
  projectFetchFailed = false;
  syncFailed = false;
  offlineFailure = false;
  userNotPermitted = false;

  // Placed after 'Loading' when syncing
  animatedEllipsis$ = timer(500, 300).pipe(
    takeUntilDestroyed(this.destroyRef),
    map(i => '.'.repeat(i % 4)),
    take(4),
    repeat()
  );

  form = new FormGroup({
    sourceParatextId: new FormControl<string | undefined>(undefined, Validators.required)
  });

  constructor(
    private readonly destroyRef: DestroyRef,
    readonly onlineStatus: OnlineStatusService,
    private readonly editorTabAddResourceDialogService: EditorTabAddResourceDialogService,
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly dialogRef: MatDialogRef<EditorTabAddResourceDialogComponent, SFProjectDoc>,
    @Inject(MAT_DIALOG_DATA) readonly dialogData: EditorTabAddResourceDialogData
  ) {}

  get appOnline(): boolean {
    return this.onlineStatus.isOnline && this.onlineStatus.isBrowserOnline;
  }

  async ngOnInit(): Promise<void> {
    await this.getProjectsAndResources();
  }

  onProjectSelected(_selectableProject: SelectableProject): void {
    this.resetErrors();
  }

  async confirmSelection(): Promise<void> {
    const paratextId: string | null | undefined = this.form.value.sourceParatextId;

    try {
      if (paratextId != null) {
        this.isLoading = true;

        // If the Paratext project has a SF project id, add the user to that project if they are not already
        const project = this.projects?.find(p => p.paratextId === paratextId);
        if (project?.projectId != null) {
          // Add the user to the project if they are not already connected to it
          if (!project.isConnected) {
            await this.projectService.onlineAddCurrentUser(project.projectId);
          }
          this.selectedProjectDoc = await this.projectService.get(project.projectId);
        } else {
          // Load the project or resource, creating it if it is not present
          const projectId: string | undefined = await this.projectService.onlineCreateResourceProject(paratextId);
          this.selectedProjectDoc = projectId != null ? await this.projectService.get(projectId) : undefined;
        }

        if (this.selectedProjectDoc != null) {
          if (this.permissionsService.canSync(this.selectedProjectDoc)) {
            await this.syncProject(this.selectedProjectDoc.id);
          } else {
            this.userNotPermitted = true;
          }
        } else {
          this.projectFetchFailed = true;
        }
      }
    } catch (e) {
      try {
        if (this.appOnline) {
          this.syncFailed = true;
          this.cancelSync();
        }
      } catch {}
    } finally {
      if (!this.appOnline) {
        this.isSyncActive = false;
        this.syncFailed = false;
        this.projectFetchFailed = false;
        this.offlineFailure = true;
      }
      this.isLoading = false;
    }
  }

  onCancel(): void {
    this.cancelSync();

    // Return undefined to cancel tab creation
    this.dialogRef.close(undefined);
  }

  onSyncProgress(isActive: boolean): void {
    this.isSyncActive = isActive;

    // Wait for sync to complete before closing dialog
    if (!isActive && this.selectedProjectDoc?.data?.texts?.length) {
      this.dialogRef.close(this.selectedProjectDoc);
    }
  }

  private async getProjectsAndResources(): Promise<void> {
    this.isLoading = true;

    await Promise.all([
      this.editorTabAddResourceDialogService
        .getProjects()
        .then(projects => {
          this.projectLoadingFailed = false;
          this.projects = this.filterConnectable(projects);
        })
        .catch(() => (this.projectLoadingFailed = true)),
      this.editorTabAddResourceDialogService
        .getResources()
        .then(resources => {
          this.resourceLoadingFailed = false;
          this.resources = resources;
        })
        .catch(() => (this.resourceLoadingFailed = true))
    ]).then(() => {
      this.isLoading = false;
    });
  }

  private cancelSync(): void {
    if (this.selectedProjectDoc?.id != null && this.isSyncActive) {
      this.projectService.onlineCancelSync(this.selectedProjectDoc.id);
    }

    this.isSyncActive = false;
  }

  private resetErrors(): void {
    this.projectLoadingFailed = false;
    this.resourceLoadingFailed = false;
    this.projectFetchFailed = false;
    this.syncFailed = false;
    this.offlineFailure = false;
  }

  private async syncProject(projectId: string): Promise<void> {
    this.isSyncActive = true;
    if (this.appOnline) {
      if (!this.selectedProjectDoc?.data?.texts?.length) {
        await this.projectService.onlineSync(projectId);
      }
      this.projectService.onlineSync(projectId);
    }
  }

  /**
   * From the given paratext projects, returns those that either:
   * - already have a corresponding SF project
   * - or have current user as admin on the PT project
   */
  private filterConnectable(projects: ParatextProject[] | undefined): ParatextProject[] | undefined {
    return projects?.filter(project => project.projectId != null || project.isConnectable);
  }
}
