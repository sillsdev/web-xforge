import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { ElementState } from 'xforge-common/models/element-state';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SFProjectSettings } from '../core/models/sf-project-settings';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';

/** Allows user to configure high-level settings of how SF will use their Paratext project. */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent extends DataLoadingComponent implements OnInit {
  form = new FormGroup({
    translationSuggestionsEnabled: new FormControl(false),
    sourceParatextId: new FormControl(undefined),
    checkingEnabled: new FormControl(false),
    usersSeeEachOthersResponses: new FormControl(false),
    shareEnabled: new FormControl(false),
    shareLevel: new FormControl(undefined)
  });
  sourceProjects?: ParatextProject[];

  private projectDoc?: SFProjectDoc;
  /** Elements in this component and their states. */
  private controlStates = new Map<Extract<keyof SFProjectSettings, string>, ElementState>();
  private paratextProjects?: ParatextProject[];
  private previousFormValues: SFProjectSettings = {};

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

  get translationSuggestionsEnabled(): boolean {
    return this.form.controls.translationSuggestionsEnabled.value;
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
        this.projectDoc = await this.projectService.get(projectId);
        this.paratextProjects = paratextProjects == null ? undefined : paratextProjects;
        if (this.projectDoc != null) {
          this.updateSettingsInfo();
          this.updateSourceProjects();
          this.subscribe(this.projectDoc.remoteChanges$, () => this.updateSourceProjects());
        }
        this.loadingFinished();
      }
    );
  }

  logInWithParatext(): void {
    if (this.projectDoc == null) {
      return;
    }

    const url = '/projects/' + this.projectDoc.id + '/settings';
    this.paratextService.linkParatext(url);
  }

  openDeleteProjectDialog(): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }

    const config: MdcDialogConfig = {
      data: { name: this.projectDoc.data.name }
    };
    const dialogRef = this.dialog.open(DeleteProjectDialogComponent, config);
    dialogRef.afterClosed().subscribe(result => {
      if (result === 'accept') {
        this.userService.setCurrentProjectId();
        if (this.projectDoc != null) {
          this.projectService.onlineDelete(this.projectDoc.id);
        }
      }
    });
  }

  getControlState(setting: Extract<keyof SFProjectSettings, string>): ElementState | undefined {
    return this.controlStates.get(setting);
  }

  private onFormValueChanges(newValue: SFProjectSettings): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }

    if (this.form.valid || this.isOnlyBasedOnInvalid) {
      // Set status and include values for changed form items
      if (
        newValue.translationSuggestionsEnabled !== this.previousFormValues.translationSuggestionsEnabled &&
        this.form.controls.translationSuggestionsEnabled.enabled
      ) {
        this.setValidators();
        if (
          !newValue.translationSuggestionsEnabled ||
          (this.form.valid && this.projectDoc.data.translateConfig.source != null)
        ) {
          this.updateSetting(newValue, 'translationSuggestionsEnabled');
        } else {
          this.controlStates.set('translationSuggestionsEnabled', ElementState.InSync);
        }
      }
      if (newValue.sourceParatextId !== this.previousFormValues.sourceParatextId) {
        if (newValue.translationSuggestionsEnabled && newValue.sourceParatextId != null) {
          const settings: SFProjectSettings = {
            sourceParatextId: newValue.sourceParatextId
          };
          if (this.previousFormValues.sourceParatextId == null) {
            settings.translationSuggestionsEnabled = true;
          }
          const updateTaskPromise = this.projectService.onlineUpdateSettings(this.projectDoc.id, settings);
          this.checkUpdateStatus('sourceParatextId', updateTaskPromise);
          if (this.previousFormValues.sourceParatextId == null) {
            this.checkUpdateStatus('translationSuggestionsEnabled', updateTaskPromise);
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
          this.previousFormValues.shareLevel = this.projectDoc.data.checkingConfig.shareLevel;
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
    }
  }

  private updateSetting(newValue: SFProjectSettings, setting: Extract<keyof SFProjectSettings, string>): void {
    if (this.projectDoc == null) {
      return;
    }
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

  private updateSettingsInfo(): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }

    const curSource = this.projectDoc.data.translateConfig.source;
    this.previousFormValues = {
      translationSuggestionsEnabled: this.projectDoc.data.translateConfig.translationSuggestionsEnabled,
      sourceParatextId: curSource != null ? curSource.paratextId : undefined,
      checkingEnabled: this.projectDoc.data.checkingConfig.checkingEnabled,
      usersSeeEachOthersResponses: this.projectDoc.data.checkingConfig.usersSeeEachOthersResponses,
      shareEnabled: this.projectDoc.data.checkingConfig.shareEnabled,
      shareLevel: this.projectDoc.data.checkingConfig.shareLevel
    };
    this.setValidators();
    this.form.reset(this.previousFormValues);
    if (!this.isLoggedInToParatext) {
      this.form.controls.translationSuggestionsEnabled.disable();
    }
    if (!this.projectDoc.data.checkingConfig.shareEnabled) {
      this.form.controls.shareLevel.disable();
    }
    this.setAllControlsToInSync();
  }

  private setValidators(): void {
    if (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.translateConfig.translationSuggestionsEnabled &&
      this.isLoggedInToParatext
    ) {
      this.form.controls.sourceParatextId.setValidators(Validators.required);
    } else {
      this.form.controls.sourceParatextId.setValidators(null);
    }
  }

  private setAllControlsToInSync(): void {
    this.controlStates.set('translationSuggestionsEnabled', ElementState.InSync);
    this.controlStates.set('sourceParatextId', ElementState.InSync);
    this.controlStates.set('checkingEnabled', ElementState.InSync);
    this.controlStates.set('usersSeeEachOthersResponses', ElementState.InSync);
    this.controlStates.set('shareEnabled', ElementState.InSync);
    this.controlStates.set('shareLevel', ElementState.InSync);
  }

  private updateSourceProjects(): void {
    if (this.projectDoc == null || this.projectDoc.data == null || this.paratextProjects == null) {
      return;
    }

    const projectId = this.projectDoc.id;
    const sourceProjects = this.paratextProjects.filter(p => p.projectId !== projectId);
    const curSource = this.projectDoc.data.translateConfig.source;
    if (curSource != null) {
      const sourceProject = sourceProjects.find(p => p.paratextId === curSource.paratextId);
      if (sourceProject == null) {
        sourceProjects.unshift({
          paratextId: curSource.paratextId,
          name: curSource.name,
          shortName: curSource.shortName,
          languageTag: curSource.writingSystem.tag,
          isConnectable: false,
          isConnected: false
        });
      }
    }
    this.sourceProjects = sourceProjects;
  }
}
