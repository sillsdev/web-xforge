import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { BehaviorSubject, map } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { ProjectSelectComponent } from '../../../project-select/project-select.component';
import { CustomValidatorState as CustomErrorState, SFValidators } from '../../../shared/sfvalidators';
import { SharedModule } from '../../../shared/shared.module';
import { compareProjectsForSorting } from '../../../shared/utils';

export interface DraftApplyDialogResult {
  projectId: string;
}

export interface DraftApplyDialogConfig {
  initialParatextId?: string;
  bookNum: number;
  chapters: number[];
}

@Component({
  selector: 'app-draft-apply-dialog',
  standalone: true,
  imports: [UICommonModule, XForgeCommonModule, TranslocoModule, CommonModule, SharedModule],
  templateUrl: './draft-apply-dialog.component.html',
  styleUrl: './draft-apply-dialog.component.scss'
})
export class DraftApplyDialogComponent implements OnInit {
  @ViewChild(ProjectSelectComponent) projectSelect?: ProjectSelectComponent;

  _projects?: SFProjectProfile[];
  protected isLoading: boolean = true;
  addToProjectForm = new FormGroup({
    targetParatextId: new FormControl<string | undefined>(this.data.initialParatextId, Validators.required),
    overwrite: new FormControl(false, Validators.requiredTrue)
  });
  /** An observable that emits the number of chapters in the target project that have some text. */
  targetChapters$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  canEditProject: boolean = true;
  targetBookExists: boolean = true;
  projectHasMissingChapters: boolean = false;
  addToProjectClicked: boolean = false;
  /** An observable that emits the target project profile if the user has permission to write to the book. */
  targetProject$: BehaviorSubject<SFProjectProfile | undefined> = new BehaviorSubject<SFProjectProfile | undefined>(
    undefined
  );
  invalidMessageMapper: { [key: string]: string } = {
    invalidProject: translate('draft_apply_dialog.please_select_valid_project'),
    bookNotFound: translate('draft_apply_dialog.book_does_not_exist', { bookName: this.bookName }),
    noWritePermissions: translate('draft_apply_dialog.no_write_permissions'),
    missingChapters: translate('draft_apply_dialog.project_has_chapters_missing', { bookName: this.bookName })
  };

  // the project id to add the draft to
  private targetProjectId?: string;
  private paratextIdToProjectId: Map<string, string> = new Map<string, string>();
  isValid: boolean = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) private data: DraftApplyDialogConfig,
    @Inject(MatDialogRef) private dialogRef: MatDialogRef<DraftApplyDialogComponent, DraftApplyDialogResult>,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    readonly i18n: I18nService,
    private readonly userService: UserService,
    private readonly onlineStatusService: OnlineStatusService
  ) {
    this.targetProject$.pipe(filterNullish()).subscribe(async project => {
      const chapters: number = await this.chaptersWithTextAsync(project);
      this.targetChapters$.next(chapters);
    });
  }

  get projects(): SFProjectProfile[] {
    return this._projects ?? [];
  }

  get bookName(): string {
    return this.i18n.localizeBook(this.data.bookNum);
  }

  get isFormValid(): boolean {
    return this.addToProjectForm.valid;
  }

  get overwriteConfirmed(): boolean {
    return !!this.addToProjectForm.controls.overwrite.value;
  }

  get projectSelectValid(): boolean {
    return this.addToProjectForm.controls.targetParatextId.valid;
  }

  get projectName(): string {
    return this.targetProject$.value?.name ?? '';
  }

  get isAppOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  ngOnInit(): void {
    this.userProjectsService.projectDocs$
      .pipe(
        filterNullish(),
        map(resourceAndProjectDocs => {
          const projects: SFProjectProfile[] = [];
          const userProjectDocs: SFProjectProfileDoc[] = resourceAndProjectDocs.filter(
            p => p.data != null && !ParatextService.isResource(p.data.paratextId)
          );
          for (const projectDoc of userProjectDocs) {
            if (projectDoc.data != null) {
              projects.push(projectDoc.data);
              this.paratextIdToProjectId.set(projectDoc.data.paratextId, projectDoc.id);
            }
          }
          return projects.sort(compareProjectsForSorting);
        })
      )
      .subscribe(projects => {
        this._projects = projects;
        this.isLoading = false;
      });
  }

  addToProject(): void {
    this.addToProjectClicked = true;
    this.validateProject();
    if (!this.isAppOnline || !this.isFormValid || this.targetProjectId == null || !this.canEditProject) {
      return;
    }
    this.dialogRef.close({ projectId: this.targetProjectId });
  }

  projectSelected(paratextId: string): void {
    if (paratextId == null) {
      this.targetProject$.next(undefined);
      return;
    }
    const project: SFProjectProfile | undefined = this.projects.find(p => p.paratextId === paratextId);
    if (project == null) {
      this.canEditProject = false;
      this.targetBookExists = false;
      this.targetProject$.next(undefined);
      this.validateProject();
      return;
    }

    this.targetProjectId = this.paratextIdToProjectId.get(paratextId);
    const targetBook: TextInfo | undefined = project.texts.find(t => t.bookNum === this.data.bookNum);
    this.targetBookExists = targetBook != null;
    this.canEditProject =
      this.textDocService.userHasGeneralEditRight(project) &&
      targetBook?.permissions[this.userService.currentUserId] === TextInfoPermission.Write;

    // also check if this is an empty book
    const bookIsEmpty: boolean = targetBook?.chapters.length === 1 && targetBook?.chapters[0].lastVerse < 1;
    const targetBookChapters: number[] = targetBook?.chapters.map(c => c.number) ?? [];
    this.projectHasMissingChapters =
      bookIsEmpty || this.data.chapters.filter(c => !targetBookChapters.includes(c)).length > 0;
    // emit the project profile document
    if (this.canEditProject && !this.projectHasMissingChapters) {
      this.targetProject$.next(project);
    } else {
      this.targetProject$.next(undefined);
    }
    this.validateProject();
  }

  close(): void {
    this.dialogRef.close();
  }

  private validateProject(): void {
    // setTimeout prevents a "changed after checked" exception (may be removable after SF-3014)
    setTimeout(() => {
      this.isValid = this.getCustomErrorState() === CustomErrorState.None;
      this.projectSelect?.customValidate(SFValidators.customValidator(this.getCustomErrorState()));
    });
  }

  private async chaptersWithTextAsync(project: SFProjectProfile): Promise<number> {
    if (this.targetProjectId == null) return 0;
    const chapters: Chapter[] | undefined = project.texts.find(t => t.bookNum === this.data.bookNum)?.chapters;
    if (chapters == null) return 0;
    const textPromises: Promise<boolean>[] = [];
    for (const chapter of chapters) {
      const textDocId = new TextDocId(this.targetProjectId, this.data.bookNum, chapter.number);
      textPromises.push(this.isNotEmpty(textDocId));
    }
    return (await Promise.all(textPromises)).filter(hasText => hasText).length;
  }

  private async isNotEmpty(textDocId: TextDocId): Promise<boolean> {
    const textDoc: TextDoc = await this.projectService.getText(textDocId);
    return textDoc.getNonEmptyVerses().length > 0;
  }

  private getCustomErrorState(): CustomErrorState {
    if (!this.projectSelectValid) {
      return CustomErrorState.InvalidProject;
    }
    if (!this.targetBookExists) {
      return CustomErrorState.BookNotFound;
    }
    if (!this.canEditProject) {
      return CustomErrorState.NoWritePermissions;
    }
    if (this.projectHasMissingChapters) {
      return CustomErrorState.MissingChapters;
    }
    return CustomErrorState.None;
  }
}
