import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ElementState } from 'xforge-common/models/element-state';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProject } from '../core/models/sfproject';
import { SFProjectService } from '../core/sfproject.service';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';

type VoidFunc = (() => void);

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
  projectId: string;
  project: SFProject;
  sourceProjects: ParatextProject[];

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
    this.subscribe(
      this.route.params.pipe(
        tap(params => {
          this.noticeService.loadingStarted();
          this.projectId = params['projectId'];
          this.form.disable();
        }),
        switchMap(() =>
          combineLatest(
            this.projectService.onlineGet(this.projectId).pipe(map(r => r.data)),
            this.paratextService.getProjects()
          )
        )
      ),
      ([project, paratextProjects]) => {
        this.form.enable();
        this.paratextProjects = paratextProjects;
        if (paratextProjects != null) {
          this.sourceProjects = paratextProjects.filter(p => p.projectId !== this.projectId);
        }
        if (project != null) {
          this.project = project;
          if (this.project) {
            this.updateSettingsInfo();
          }
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
    const url = '/projects/' + this.projectId + '/settings';
    this.paratextService.linkParatext(url);
  }

  openDeleteProjectDialog(): void {
    const config: MdcDialogConfig = {
      data: { name: this.project.projectName }
    };
    const dialogRef = this.dialog.open(DeleteProjectDialogComponent, config);
    dialogRef.afterClosed().subscribe(async result => {
      if (result === 'accept') {
        await this.userService.updateCurrentProjectId();
        await this.projectService.onlineDelete(this.projectId);
      }
    });
  }

  getControlState(setting: string): ElementState {
    return this.controlStates.get(setting);
  }

  private onFormValueChanges(newValue: Settings): void {
    if (this.form.valid || this.isOnlyBasedOnInvalid) {
      let isUpdateNeeded: boolean = false;
      const updatedProject: Partial<SFProject> = {};
      const successHandlers: VoidFunc[] = [];
      const failStateHandlers: VoidFunc[] = [];
      // Set status and include values for changed form items
      if (newValue.translate !== this.project.translateEnabled && this.form.controls.translate.enabled) {
        updatedProject.translateEnabled = newValue.translate;
        this.project.translateEnabled = newValue.translate;
        this.setValidators();
        if (!newValue.translate || (this.form.valid && this.project.sourceParatextId)) {
          this.updateControlState('translate', successHandlers, failStateHandlers);
          isUpdateNeeded = true;
        } else {
          this.controlStates.set('translate', ElementState.InSync);
        }
      }
      if (newValue.sourceParatextId !== this.project.sourceParatextId) {
        if (newValue.translate && newValue.sourceParatextId != null) {
          updatedProject.sourceParatextId = newValue.sourceParatextId;
          updatedProject.sourceInputSystem = ParatextService.getInputSystem(
            this.sourceProjects.find(project => project.paratextId === newValue.sourceParatextId)
          );
          this.project.sourceParatextId = updatedProject.sourceParatextId;
          this.project.sourceInputSystem = updatedProject.sourceInputSystem;
          this.updateControlState('sourceParatextId', successHandlers, failStateHandlers);
          if (this.previousFormValues.sourceParatextId == null) {
            this.updateControlState('translate', successHandlers, failStateHandlers);
          }
          isUpdateNeeded = true;
        }
      }
      if (newValue.checking !== this.project.checkingEnabled) {
        updatedProject.checkingEnabled = newValue.checking;
        this.project.checkingEnabled = newValue.checking;
        this.updateControlState('checking', successHandlers, failStateHandlers);
        isUpdateNeeded = true;
      }
      if (newValue.seeOthersResponses !== this.project.usersSeeEachOthersResponses) {
        updatedProject.usersSeeEachOthersResponses = newValue.seeOthersResponses;
        this.project.usersSeeEachOthersResponses = newValue.seeOthersResponses;
        this.updateControlState('seeOthersResponses', successHandlers, failStateHandlers);
        isUpdateNeeded = true;
      }
      if (newValue.share !== this.project.shareEnabled) {
        updatedProject.shareEnabled = newValue.share;
        this.project.shareEnabled = newValue.share;
        this.updateControlState('share', successHandlers, failStateHandlers);
        isUpdateNeeded = true;
        const shareLevelControl = this.form.controls.shareLevel;
        if (newValue.share) {
          shareLevelControl.enable();
        } else {
          shareLevelControl.disable();
        }
      }
      if (
        newValue.shareLevel != null &&
        newValue.shareLevel !== this.project.shareLevel &&
        this.form.controls.shareLevel.enabled
      ) {
        updatedProject.shareLevel = newValue.shareLevel;
        this.project.shareLevel = newValue.shareLevel;
        this.updateControlState('shareLevel', successHandlers, failStateHandlers);
        isUpdateNeeded = true;
      }
      if (!isUpdateNeeded) {
        return;
      }
      this.previousFormValues = newValue;
      this.projectService
        .onlineUpdateAttributes(this.project.id, updatedProject)
        .then(() => {
          while (successHandlers.length) {
            successHandlers.pop().call(this);
          }
        })
        .catch(() => {
          while (failStateHandlers.length) {
            failStateHandlers.pop().call(this);
          }
        });
    } else if (this.previousFormValues && this.form.errors && this.form.errors.requireAtLeastOneWithValue) {
      // reset invalid form value
      setTimeout(() => this.form.patchValue(this.previousFormValues), 1000);
    }
  }

  private updateSettingsInfo() {
    this.previousFormValues = {
      translate: this.project.translateEnabled,
      sourceParatextId: this.project.sourceParatextId,
      checking: this.project.checkingEnabled,
      seeOthersResponses: this.project.usersSeeEachOthersResponses,
      share: this.project.shareEnabled,
      shareLevel: this.project.shareLevel
    };
    this.setValidators();
    this.form.reset(this.previousFormValues);
    if (!this.isLoggedInToParatext) {
      this.form.controls.translate.disable();
    }
    if (!this.project.shareEnabled) {
      this.form.controls.shareLevel.disable();
    }
    this.setAllControlsToInSync();
  }

  private setValidators() {
    this.project.translateEnabled && this.isLoggedInToParatext
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

  // Update the controlStates for handling submitting a settings change (used to show spinner and success checkmark)
  private updateControlState(formControl: string, successHandlers: VoidFunc[], failureHandlers: VoidFunc[]) {
    this.controlStates.set(formControl, ElementState.Submitting);
    successHandlers.push(() => this.controlStates.set(formControl, ElementState.Submitted));
    failureHandlers.push(() => this.controlStates.set(formControl, ElementState.Error));
  }
}
