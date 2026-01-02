import { AsyncPipe } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatError } from '@angular/material/form-field';
import { MatProgressBar } from '@angular/material/progress-bar';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { BehaviorSubject, map } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { ProjectSelectComponent } from '../../../project-select/project-select.component';
import { NoticeComponent } from '../../../shared/notice/notice.component';
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
  imports: [
    RouterLinkDirective,
    MatButton,
    MatCheckbox,
    MatProgressBar,
    MatDialogContent,
    MatDialogClose,
    MatDialogActions,
    MatDialogTitle,
    MatError,
    FormsModule,
    ReactiveFormsModule,
    TranslocoModule,
    AsyncPipe,
    NoticeComponent,
    ProjectSelectComponent
  ],
  templateUrl: './draft-apply-dialog.component.html',
  styleUrl: './draft-apply-dialog.component.scss'
})
export class DraftApplyDialogComponent implements OnInit {
  /** An observable that emits the target project profile if the user has permission to write to the book. */
  targetProject$: BehaviorSubject<SFProjectProfile | undefined> = new BehaviorSubject<SFProjectProfile | undefined>(
    undefined
  );

  _projects?: SFProjectProfile[];
  protected isLoading: boolean = true;
  addToProjectForm = new FormGroup({
    targetParatextId: new FormControl<string | undefined>(this.data.initialParatextId, Validators.required),
    overwrite: new FormControl(false, Validators.requiredTrue),
    createChapters: new FormControl(false, control =>
      !this.projectHasMissingChapters() || control.value ? null : { mustConfirmCreateChapters: true }
    )
  });
  /** An observable that emits the number of chapters in the target project that have some text. */
  targetChapters$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  addToProjectClicked: boolean = false;

  // the project id to add the draft to
  private targetProjectId?: string;
  private paratextIdToProjectId: Map<string, string> = new Map<string, string>();

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

  get isValid(): boolean {
    return this.addToProjectForm.controls.targetParatextId.valid;
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

  get createChaptersControl(): FormControl {
    return this.addToProjectForm.controls.createChapters;
  }

  get confirmCreateChapters(): boolean {
    return !!this.createChaptersControl.value;
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

  async addToProject(): Promise<void> {
    this.addToProjectClicked = true;
    this.addToProjectForm.controls.createChapters.updateValueAndValidity();
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
    this.createChaptersControl.updateValueAndValidity();

    if (project == null) {
      this.targetProject$.next(undefined);
      return;
    }

    this.targetProjectId = this.paratextIdToProjectId.get(paratextId);

    // emit the project profile document
    if (this.canEditProject(project)) {
      this.targetProject$.next(project);
    } else {
      this.targetProject$.next(undefined);
    }
  }

  projectHasMissingChapters(): boolean {
    const project = this.targetProject$.getValue();
    const targetBook: TextInfo | undefined = project?.texts.find(t => t.bookNum === this.data.bookNum);
    const bookIsEmpty: boolean = targetBook?.chapters.length === 1 && targetBook?.chapters[0].lastVerse < 1;
    const targetBookChapters: number[] = targetBook?.chapters.map(c => c.number) ?? [];
    return bookIsEmpty || this.data.chapters.filter(c => !targetBookChapters.includes(c)).length > 0;
  }

  targetBookExists(project: SFProjectProfile): boolean {
    const targetBook: TextInfo | undefined = project.texts.find(t => t.bookNum === this.data.bookNum);
    return targetBook != null;
  }

  canEditProject(project: SFProjectProfile): boolean {
    const targetBook: TextInfo | undefined = project.texts.find(t => t.bookNum === this.data.bookNum);

    return (
      this.textDocService.userHasGeneralEditRight(project) &&
      targetBook?.permissions[this.userService.currentUserId] === TextInfoPermission.Write
    );
  }

  close(): void {
    this.dialogRef.close();
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

  private _projectSelectCustomValidator(control: AbstractControl): ValidationErrors | null {
    const project = control.value as SFProjectProfile | string | null;
    if (project == null || typeof project === 'string') return null;

    const errors: { [key: string]: boolean } = {};
    if (!this.targetBookExists(project)) errors.bookNotFound = true;
    if (!this.canEditProject(project)) errors.noWritePermissions = true;
    return Object.keys(errors).length > 0 ? errors : null;
  }

  projectSelectCustomValidator = this._projectSelectCustomValidator.bind(this);

  private _errorMessageMapper(errors: ValidationErrors): string | null {
    if (errors.bookNotFound) {
      return this.i18n.translateStatic('draft_apply_dialog.book_does_not_exist', { bookName: this.bookName });
    }
    if (errors.noWritePermissions) {
      return this.i18n.translateStatic('draft_apply_dialog.no_write_permissions');
    }
    return null;
  }

  errorMessageMapper = this._errorMessageMapper.bind(this);
}
