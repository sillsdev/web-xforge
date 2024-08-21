import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { BehaviorSubject, filter, map, Observable } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../core/models/text-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { compareProjectsForSorting } from '../../../shared/utils';

export interface DraftApplyDialogResult {
  projectId: string;
}

@Component({
  selector: 'app-draft-apply-dialog',
  standalone: true,
  imports: [UICommonModule, XForgeCommonModule, TranslocoModule, CommonModule],
  templateUrl: './draft-apply-dialog.component.html',
  styleUrl: './draft-apply-dialog.component.scss'
})
export class DraftApplyDialogComponent implements OnInit {
  _projects?: ParatextProject[];
  // the project to add the draft to
  targetProjectId?: string;
  isLoading: boolean = false;
  canEditProject: boolean = true;
  addToProjectForm = new FormGroup({
    overwrite: new FormControl(false, Validators.requiredTrue)
  });
  connectOtherProject = this.i18n.translateTextAroundTemplateTags('draft_apply_dialog.looking_for_unlisted_project');
  /** An observable that emits the number of chapters in the target project that have some text. */
  targetChapters$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  private targetProjectDoc$: BehaviorSubject<SFProjectProfileDoc | undefined> = new BehaviorSubject<
    SFProjectProfileDoc | undefined
  >(undefined);

  constructor(
    @Inject(MAT_DIALOG_DATA) private data: { bookNum: number },
    @Inject(MatDialogRef) private dialogRef: MatDialogRef<DraftApplyDialogComponent, DraftApplyDialogResult>,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    private readonly i18n: I18nService,
    private readonly userService: UserService
  ) {
    this.targetProject$.pipe(filterNullish()).subscribe(async project => {
      const chapters: number = await this.chaptersWithTextAsync(project);
      this.targetChapters$.next(chapters);
    });
  }

  get projects(): ParatextProject[] {
    return this._projects ?? [];
  }

  get addDisabled(): boolean {
    return this.targetProjectId == null || !this.canEditProject || this.addToProjectForm.invalid;
  }

  get bookName(): string {
    return this.i18n.localizeBook(this.data.bookNum);
  }

  /** An observable that emits the target project profile if the user has permission to write to the specified book. */
  get targetProject$(): Observable<SFProjectProfile | undefined> {
    return this.targetProjectDoc$.pipe(
      filter(() => this.canEditProject),
      filterNullish(),
      map(p => p.data)
    );
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    const projects: ParatextProject[] | undefined = await this.paratextService.getProjects();
    this._projects = projects?.sort(compareProjectsForSorting);
    this.isLoading = false;
  }

  addToProject(): void {
    if (this.targetProjectId == null || !this.canEditProject) {
      this.dialogRef.close();
      return;
    }
    this.dialogRef.close({ projectId: this.targetProjectId });
  }

  async projectSelectedAsync(paratextId: string): Promise<void> {
    this.targetProjectId = this.projects?.find(p => p.paratextId === paratextId)?.projectId;
    if (this.targetProjectId == null) return;
    const projectDoc: SFProjectProfileDoc = await this.projectService.getProfile(this.targetProjectId);
    if (projectDoc.data == null) {
      this.canEditProject = false;
      return;
    }

    // emit the project profile document
    this.targetProjectDoc$.next(projectDoc);
    this.canEditProject =
      this.textDocService.userHasGeneralEditRight(projectDoc.data) &&
      projectDoc.data.texts.find(t => t.bookNum === this.data.bookNum)?.permissions[this.userService.currentUserId] ===
        TextInfoPermission.Write;
  }

  private async chaptersWithTextAsync(project: SFProjectProfile): Promise<number> {
    if (this.targetProjectId == null) return 0;
    const chapters = project.texts.find(t => t.bookNum === this.data.bookNum)?.chapters;
    if (chapters == null) return 0;
    const textPromises: Promise<boolean>[] = [];
    // for (const chapter of chapters) {
    //   const textDocId = new TextDocId(this.targetProjectId, this.data.bookNum, chapter.number);
    //   textPromises.push(this.isNotEmpty(textDocId));
    // }
    // return (await Promise.all(textPromises)).filter(hasText => hasText).length;
    return 0;
  }

  private async isNotEmpty(textDocId: TextDocId): Promise<boolean> {
    return true;
    // const textDoc: TextDoc = await this.projectService.getText(textDocId);
    // return textDoc.getNonEmptyVerses().length > 0;
  }
}
