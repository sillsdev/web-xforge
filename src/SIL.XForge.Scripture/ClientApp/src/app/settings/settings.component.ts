import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ElementState } from 'xforge-common/models/element-state';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { environment } from '../../environments/environment';
import { SFProject } from '../core/models/sfproject';
import { SFProjectDoc } from '../core/models/sfproject-doc';
import { UpdateTasksParams } from '../core/models/update-tasks-params';
import { SFProjectService } from '../core/sfproject.service';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';

interface Settings {
  translate?: boolean;
  sourceParatextId?: string;
  checking?: boolean;
  seeOthersResponses?: boolean;
  share?: boolean;
  shareLevel?: SharingLevel;
}

/** Allows user to configure high-level settings of how SF will use their Paratext project. */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  form = new FormGroup(
    {
      translate: new FormControl(false),
      sourceParatextId: new FormControl(undefined),
      checking: new FormControl(false),
      seeOthersResponses: new FormControl(false),
      share: new FormControl(false),
      shareLevel: new FormControl(undefined)
    },
    XFValidators.requireOneWithValue(['translate', 'checking'], true)
  );
  sourceProjects: ParatextProject[];

  private projectDoc: SFProjectDoc;
  /** Elements in this component and their states. */
  private controlStates = new Map<string, ElementState>();
  // ensures `get isLoading()` marks the initial load of data in the component since `noticeService.isLoading` is slow
  // to update its status
  private isFirstLoad: boolean = true;
  private paratextProjects: ParatextProject[];
  private previousFormValues: Settings;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super();
    this.noticeService.loadingStarted();
  }

  get isLoading(): boolean {
    return this.isFirstLoad || this.noticeService.isLoading;
  }

  get isLoggedInToParatext(): boolean {
    return this.paratextProjects != null;
  }

  get translate(): boolean {
    return this.form.controls.translate.value;
  }

  get checking(): boolean {
    return this.form.controls.checking.value;
  }

  get projectId(): string {
    return this.projectDoc == null ? '' : this.projectDoc.id;
  }

  private get isOnlyBasedOnInvalid(): boolean {
    let invalidCount = 0;
    const controls = this.form.controls;
    for (const name in this.form.controls) {
      if (controls[name].invalid) {
        invalidCount++;
      }
    }

    return this.form.controls.sourceParatextId.invalid && invalidCount === 1;
  }

  ngOnInit(): void {
    this.form.disable();
    this.form.setErrors({ required: true });
    this.form.valueChanges.subscribe(value => this.onFormValueChanges(value));
    this.setAllControlsToInSync();
    const projectId$ = this.route.params.pipe(
      tap(() => {
        this.noticeService.loadingStarted();
        this.form.disable();
      }),
      map(params => params['projectId'] as string)
    );
    this.subscribe(
      combineLatest(projectId$, this.paratextService.getProjects()),
      async ([projectId, paratextProjects]) => {
        this.noticeService.loadingStarted();
        this.form.enable();
        this.paratextProjects = paratextProjects;
        if (paratextProjects != null) {
          this.sourceProjects = paratextProjects.filter(p => p.projectId !== projectId);
        }
        this.projectDoc = await this.projectService.get(projectId);
        if (this.projectDoc) {
          this.updateSettingsInfo();
        }
        this.isFirstLoad = false;
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.noticeService.loadingFinished();
  }

  logInWithParatext(): void {
    const url = '/projects/' + this.projectDoc.id + '/settings';
    this.paratextService.linkParatext(url);
  }

  openDeleteProjectDialog(): void {
    const config: MdcDialogConfig = {
      data: { name: this.projectDoc.data.projectName }
    };
    const dialogRef = this.dialog.open(DeleteProjectDialogComponent, config);
    dialogRef.afterClosed().subscribe(async result => {
      if (result === 'accept') {
        const userDoc = await this.userService.getCurrentUser();
        await userDoc.submitJson0Op(op => op.unset(u => u.sites[environment.siteId].currentProjectId));
        await this.projectService.onlineDelete(this.projectDoc.id);
      }
    });
  }

  getControlState(setting: string): ElementState {
    return this.controlStates.get(setting);
  }

  private onFormValueChanges(newValue: Settings): void {
    if (this.projectDoc == null) {
      return;
    }

    if (this.form.valid || this.isOnlyBasedOnInvalid) {
      const updatedProject: Partial<SFProject> = {};
      // Set status and include values for changed form items
      if (newValue.translate !== this.projectDoc.data.translateEnabled && this.form.controls.translate.enabled) {
        updatedProject.translateEnabled = newValue.translate;
        this.setValidators();
        if (!newValue.translate || (this.form.valid && this.projectDoc.data.sourceParatextId)) {
          this.previousFormValues = newValue;
          this.checkUpdateStatus(
            'translate',
            this.projectService.updateTasks(this.projectDoc.id, { translateEnabled: newValue.translate })
          );
        } else {
          this.controlStates.set('translate', ElementState.InSync);
        }
      }
      if (newValue.sourceParatextId !== this.projectDoc.data.sourceParatextId) {
        if (newValue.translate && newValue.sourceParatextId != null) {
          updatedProject.sourceParatextId = newValue.sourceParatextId;
          updatedProject.sourceInputSystem = ParatextService.getInputSystem(
            this.sourceProjects.find(project => project.paratextId === newValue.sourceParatextId)
          );
          const parameters: UpdateTasksParams = {
            sourceParatextId: updatedProject.sourceParatextId,
            sourceInputSystem: updatedProject.sourceInputSystem
          };
          if (this.previousFormValues.sourceParatextId == null) {
            parameters.translateEnabled = true;
          }
          const updateTaskPromise = this.projectService.updateTasks(this.projectDoc.id, parameters);
          this.checkUpdateStatus('sourceParatextId', updateTaskPromise);
          if (this.previousFormValues.sourceParatextId == null) {
            this.checkUpdateStatus('translate', updateTaskPromise);
          }
          this.previousFormValues = newValue;
        }
      }
      if (newValue.checking !== this.projectDoc.data.checkingEnabled) {
        updatedProject.checkingEnabled = newValue.checking;
        this.previousFormValues = newValue;
        this.checkUpdateStatus(
          'checking',
          this.projectService.updateTasks(this.projectDoc.id, { checkingEnabled: newValue.checking })
        );
      }
      if (newValue.seeOthersResponses !== this.projectDoc.data.usersSeeEachOthersResponses) {
        updatedProject.usersSeeEachOthersResponses = newValue.seeOthersResponses;
        this.previousFormValues = newValue;
        this.checkUpdateStatus(
          'seeOthersResponses',
          this.projectDoc.submitJson0Op(op => op.set(p => p.usersSeeEachOthersResponses, newValue.seeOthersResponses))
        );
      }
      if (newValue.share !== this.projectDoc.data.shareEnabled) {
        updatedProject.shareEnabled = newValue.share;
        this.previousFormValues = newValue;
        this.checkUpdateStatus(
          'share',
          this.projectDoc.submitJson0Op(op => op.set(p => p.shareEnabled, newValue.share))
        );
        const shareLevelControl = this.form.controls.shareLevel;
        if (newValue.share) {
          shareLevelControl.enable();
        } else {
          shareLevelControl.disable();
        }
      }
      if (
        newValue.shareLevel != null &&
        newValue.shareLevel !== this.projectDoc.data.shareLevel &&
        this.form.controls.shareLevel.enabled
      ) {
        updatedProject.shareLevel = newValue.shareLevel;
        this.previousFormValues = newValue;
        this.checkUpdateStatus(
          'shareLevel',
          this.projectDoc.submitJson0Op(op => op.set(p => p.shareLevel, newValue.shareLevel))
        );
      }
    } else if (this.previousFormValues && this.form.errors && this.form.errors.requireAtLeastOneWithValue) {
      // reset invalid form value
      setTimeout(() => this.form.patchValue(this.previousFormValues), 1000);
    }
  }

  private checkUpdateStatus(formControl: string, updatePromise: Promise<any>): void {
    this.controlStates.set(formControl, ElementState.Submitting);
    updatePromise
      .then(() => this.controlStates.set(formControl, ElementState.Submitted))
      .catch(() => this.controlStates.set(formControl, ElementState.Error));
  }

  private updateSettingsInfo() {
    this.previousFormValues = {
      translate: this.projectDoc.data.translateEnabled,
      sourceParatextId: this.projectDoc.data.sourceParatextId,
      checking: this.projectDoc.data.checkingEnabled,
      seeOthersResponses: this.projectDoc.data.usersSeeEachOthersResponses,
      share: this.projectDoc.data.shareEnabled,
      shareLevel: this.projectDoc.data.shareLevel
    };
    this.setValidators();
    this.form.reset(this.previousFormValues);
    if (!this.isLoggedInToParatext) {
      this.form.controls.translate.disable();
    }
    if (!this.projectDoc.data.shareEnabled) {
      this.form.controls.shareLevel.disable();
    }
    this.setAllControlsToInSync();
  }

  private setValidators() {
    this.projectDoc.data.translateEnabled && this.isLoggedInToParatext
      ? this.form.controls.sourceParatextId.setValidators(Validators.required)
      : this.form.controls.sourceParatextId.setValidators(null);
  }

  private setAllControlsToInSync() {
    this.controlStates.set('translate', ElementState.InSync);
    this.controlStates.set('sourceParatextId', ElementState.InSync);
    this.controlStates.set('checking', ElementState.InSync);
    this.controlStates.set('seeOthersResponses', ElementState.InSync);
    this.controlStates.set('share', ElementState.InSync);
    this.controlStates.set('shareLevel', ElementState.InSync);
  }
}
