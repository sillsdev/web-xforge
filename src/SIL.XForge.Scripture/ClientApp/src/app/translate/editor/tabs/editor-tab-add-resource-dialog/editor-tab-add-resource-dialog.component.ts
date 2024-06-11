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
        this.selectedProjectDoc = await this.fetchProject(paratextId);

        if (this.selectedProjectDoc != null) {
          if (this.permissionsService.canSync(this.selectedProjectDoc)) {
            // Wait for sync if no texts
            if (!this.selectedProjectDoc.data?.texts.length) {
              this.isSyncActive = true;
              await this.syncProject(this.selectedProjectDoc.id);
            } else {
              // Otherwise, start a sync in the background and close dialog
              this.syncProject(this.selectedProjectDoc.id);
              this.dialogRef.close(this.selectedProjectDoc);
            }
          } else {
            this.dialogRef.close(this.selectedProjectDoc);
          }
        } else {
          this.projectFetchFailed = true;
        }
      }
    } catch (e) {
      this.syncFailed = true;
      try {
        this.cancelSync();
      } catch {}
    } finally {
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
    if (!isActive) {
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
  }

  /**
   * Gets the project/resource with the selected paratext id, creating an SF project for it if needed.
   */
  private async fetchProject(paratextId: string): Promise<SFProjectDoc | undefined> {
    const selectedProjectId: string | undefined = await this.projectService.getOrCreateRealtimeProject(paratextId);
    return selectedProjectId != null ? this.projectService.get(selectedProjectId) : undefined;
  }

  private async syncProject(projectId: string): Promise<void> {
    await this.projectService.onlineSync(projectId);
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
