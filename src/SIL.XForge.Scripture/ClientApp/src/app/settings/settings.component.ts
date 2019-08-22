import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { ElementState } from 'xforge-common/models/element-state';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { XFValidators } from 'xforge-common/xfvalidators';
import { environment } from '../../environments/environment';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SFProjectSettings } from '../core/models/sf-project-settings';
import { SFProjectService } from '../core/sf-project.service';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';

/** Allows user to configure high-level settings of how SF will use their Paratext project. */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent extends DataLoadingComponent implements OnInit {
  form = new FormGroup(
    {
      translateEnabled: new FormControl(false),
      sourceParatextId: new FormControl(undefined),
      checkingEnabled: new FormControl(false),
      usersSeeEachOthersResponses: new FormControl(false),
      shareEnabled: new FormControl(false),
      shareLevel: new FormControl(undefined)
    },
    XFValidators.requireOneWithValue(
      [nameof<SFProjectSettings>('translateEnabled'), nameof<SFProjectSettings>('checkingEnabled')],
      true
    )
  );
  sourceProjects: ParatextProject[];

  private projectDoc: SFProjectDoc;
  /** Elements in this component and their states. */
  private controlStates = new Map<Extract<keyof SFProjectSettings, string>, ElementState>();
  private paratextProjects: ParatextProject[];
  private previousFormValues: SFProjectSettings;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super(noticeService);
    this.loadingStarted();
  }

  get isLoggedInToParatext(): boolean {
    return this.paratextProjects != null;
  }

  get translateEnabled(): boolean {
    return this.form.controls.translateEnabled.value;
  }

  get checkingEnabled(): boolean {
    return this.form.controls.checkingEnabled.value;
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
        this.loadingStarted();
        this.form.disable();
      }),
      map(params => params['projectId'] as string)
    );
    this.subscribe(
      combineLatest(projectId$, this.paratextService.getProjects()),
      async ([projectId, paratextProjects]) => {
        this.loadingStarted();
        this.form.enable();
        this.paratextProjects = paratextProjects;
        if (paratextProjects != null) {
          this.sourceProjects = paratextProjects.filter(p => p.projectId !== projectId);
        }
        this.projectDoc = await this.projectService.get(projectId);
        if (this.projectDoc) {
          this.updateSettingsInfo();
        }
        this.loadingFinished();
      }
    );
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

  getControlState(setting: Extract<keyof SFProjectSettings, string>): ElementState {
    return this.controlStates.get(setting);
  }

  private onFormValueChanges(newValue: SFProjectSettings): void {
    if (this.projectDoc == null) {
      return;
    }

    if (this.form.valid || this.isOnlyBasedOnInvalid) {
      // Set status and include values for changed form items
      if (
        newValue.translateEnabled !== this.previousFormValues.translateEnabled &&
        this.form.controls.translateEnabled.enabled
      ) {
        this.setValidators();
        if (!newValue.translateEnabled || (this.form.valid && this.projectDoc.data.sourceParatextId)) {
          this.updateSetting(newValue, 'translateEnabled');
        } else {
          this.controlStates.set('translateEnabled', ElementState.InSync);
        }
      }
      if (newValue.sourceParatextId !== this.previousFormValues.sourceParatextId) {
        if (newValue.translateEnabled && newValue.sourceParatextId != null) {
          const settings: SFProjectSettings = {
            sourceParatextId: newValue.sourceParatextId,
            sourceInputSystem: ParatextService.getInputSystem(
              this.sourceProjects.find(project => project.paratextId === newValue.sourceParatextId)
            )
          };
          if (this.previousFormValues.sourceParatextId == null) {
            settings.translateEnabled = true;
          }
          const updateTaskPromise = this.projectService.onlineUpdateSettings(this.projectDoc.id, settings);
          this.checkUpdateStatus('sourceParatextId', updateTaskPromise);
          if (this.previousFormValues.sourceParatextId == null) {
            this.checkUpdateStatus('translateEnabled', updateTaskPromise);
          }
          this.previousFormValues = newValue;
        }
      }
      if (newValue.checkingEnabled !== this.previousFormValues.checkingEnabled) {
        this.updateSetting(newValue, 'checkingEnabled');
      }
      if (newValue.usersSeeEachOthersResponses !== this.previousFormValues.usersSeeEachOthersResponses) {
        this.updateSetting(newValue, 'usersSeeEachOthersResponses');
      }
      if (newValue.shareEnabled !== this.previousFormValues.shareEnabled) {
        this.updateSetting(newValue, 'shareEnabled');
        const shareLevelControl = this.form.controls.shareLevel;
        if (newValue.shareEnabled) {
          // when a control is disabled the value is undefined, so reset back to previous value
          this.previousFormValues.shareLevel = this.projectDoc.data.shareLevel;
          shareLevelControl.enable();
        } else {
          shareLevelControl.disable();
        }
      }
      if (
        newValue.shareLevel != null &&
        newValue.shareLevel !== this.previousFormValues.shareLevel &&
        this.form.controls.shareLevel.enabled
      ) {
        this.updateSetting(newValue, 'shareLevel');
      }
    } else if (this.previousFormValues && this.form.errors && this.form.errors.requireAtLeastOneWithValue) {
      // reset invalid form value
      setTimeout(() => this.form.patchValue(this.previousFormValues), 1000);
    }
  }

  private updateSetting(newValue: SFProjectSettings, setting: Extract<keyof SFProjectSettings, string>): void {
    const settings: SFProjectSettings = { [setting]: newValue[setting] };
    this.checkUpdateStatus(setting, this.projectService.onlineUpdateSettings(this.projectDoc.id, settings));
    this.previousFormValues = newValue;
  }

  private checkUpdateStatus(setting: Extract<keyof SFProjectSettings, string>, updatePromise: Promise<void>): void {
    this.controlStates.set(setting, ElementState.Submitting);
    updatePromise
      .then(() => this.controlStates.set(setting, ElementState.Submitted))
      .catch(() => this.controlStates.set(setting, ElementState.Error));
  }

  private updateSettingsInfo() {
    this.previousFormValues = {
      translateEnabled: this.projectDoc.data.translateEnabled,
      sourceParatextId: this.projectDoc.data.sourceParatextId,
      checkingEnabled: this.projectDoc.data.checkingEnabled,
      usersSeeEachOthersResponses: this.projectDoc.data.usersSeeEachOthersResponses,
      shareEnabled: this.projectDoc.data.shareEnabled,
      shareLevel: this.projectDoc.data.shareLevel
    };
    this.setValidators();
    this.form.reset(this.previousFormValues);
    if (!this.isLoggedInToParatext) {
      this.form.controls.translateEnabled.disable();
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
    this.controlStates.set('translateEnabled', ElementState.InSync);
    this.controlStates.set('sourceParatextId', ElementState.InSync);
    this.controlStates.set('checkingEnabled', ElementState.InSync);
    this.controlStates.set('usersSeeEachOthersResponses', ElementState.InSync);
    this.controlStates.set('shareEnabled', ElementState.InSync);
    this.controlStates.set('shareLevel', ElementState.InSync);
  }
}
