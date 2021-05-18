import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web/dialog';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService, TextAroundTemplate } from 'xforge-common/i18n.service';
import { ElementState } from 'xforge-common/models/element-state';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SFProjectSettings } from '../core/models/sf-project-settings';
import { ParatextService, SelectableProject } from '../core/paratext.service';
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
  isActiveSourceProject: boolean = false;
  projects?: ParatextProject[];
  resources?: SelectableProject[];
  nonSelectableProjects?: SelectableProject[];

  private projectDoc?: SFProjectDoc;
  /** Elements in this component and their states. */
  private controlStates = new Map<Extract<keyof SFProjectSettings, string>, ElementState>();
  private previousFormValues: SFProjectSettings = {};
  private _isAppOnline: boolean = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly router: Router,
    private readonly pwaService: PwaService,
    readonly i18n: I18nService
  ) {
    super(noticeService);
  }

  get synchronizeWarning(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('settings.will_not_delete_paratext_project');
  }

  get shareDescription(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('settings.users_can_share_the_project');
  }

  get isLoggedInToParatext(): boolean {
    return this.projects != null;
  }

  get translationSuggestionsEnabled(): boolean {
    return this.form.controls.translationSuggestionsEnabled.value;
  }

  get checkingEnabled(): boolean {
    return this.form.controls.checkingEnabled.value;
  }

  get projectId(): string {
    return this.projectDoc?.id || '';
  }

  get projectParatextId(): string | undefined {
    return this.projectDoc?.data?.paratextId;
  }

  set isAppOnline(isOnline: boolean) {
    isOnline ? this.form.enable() : this.form.disable();
    this._isAppOnline = isOnline;
  }

  get isAppOnline(): boolean {
    return this._isAppOnline;
  }

  get deleteButtonDisabled(): boolean {
    return !this.isAppOnline || this.isLoading || this.isActiveSourceProject;
  }

  ngOnInit(): void {
    this.form.disable();
    this.form.valueChanges.subscribe(value => this.onFormValueChanges(value));
    this.setAllControlsToInSync();
    this.isAppOnline = this.pwaService.isOnline;
    const projectId$ = this.route.params.pipe(
      tap(() => {
        this.loadingStarted();
        if (!this.isAppOnline) {
          this.loadingFinished();
        }
      }),
      map(params => params['projectId'] as string)
    );
    this.subscribe(combineLatest([this.pwaService.onlineStatus, projectId$]), async ([isOnline, projectId]) => {
      this.isAppOnline = isOnline;
      if (isOnline && this.projects == null) {
        this.loadingStarted();
        const projectDocPromise = this.projectService.get(projectId);
        [this.projects, this.resources] = await this.paratextService.getProjectsAndResources();
        this.projectDoc = await projectDocPromise;
        if (this.projectDoc != null) {
          this.updateSettingsInfo();
          this.updateNonSelectableProjects();
          this.subscribe(this.projectDoc.remoteChanges$, () => this.updateNonSelectableProjects());
        }
        this.isActiveSourceProject = await this.projectService.onlineIsSourceProject(projectId);
        this.loadingFinished();
      }
    });
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
    dialogRef.afterClosed().subscribe(async result => {
      if (result === 'accept') {
        this.userService.setCurrentProjectId();
        if (this.projectDoc != null) {
          await this.projectService.onlineDelete(this.projectDoc.id);
          this.router.navigateByUrl('/projects', { replaceUrl: true });
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
    // Set status and include values for changed form items
    const sourceProjectChanged: boolean = newValue.sourceParatextId !== this.previousFormValues.sourceParatextId;
    if (
      newValue.translationSuggestionsEnabled !== this.previousFormValues.translationSuggestionsEnabled &&
      this.form.controls.translationSuggestionsEnabled.enabled
    ) {
      if (!newValue.translationSuggestionsEnabled || (newValue.sourceParatextId != null && !sourceProjectChanged)) {
        // Translation suggestions is set to false or is re-enabled
        this.updateSetting(newValue, 'translationSuggestionsEnabled');
        return;
      } else {
        this.controlStates.set('translationSuggestionsEnabled', ElementState.InSync);
      }
    }
    // Check if the source project needs to be updated
    if (newValue.translationSuggestionsEnabled && newValue.sourceParatextId != null && sourceProjectChanged) {
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
      return;
    }

    this.updateCheckingConfig(newValue);
  }

  private updateSetting(newValue: SFProjectSettings, setting: Extract<keyof SFProjectSettings, string>): void {
    if (this.projectDoc == null) {
      return;
    }
    const settings: SFProjectSettings = { [setting]: newValue[setting] };
    this.checkUpdateStatus(setting, this.projectService.onlineUpdateSettings(this.projectDoc.id, settings));
    this.previousFormValues = newValue;
  }

  private updateCheckingConfig(newValue: SFProjectSettings): void {
    if (this.projectDoc?.data == null) {
      return;
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
    this.form.reset(this.previousFormValues);
    if (!this.isLoggedInToParatext) {
      this.form.controls.translationSuggestionsEnabled.disable();
    }
    if (!this.projectDoc.data.checkingConfig.shareEnabled) {
      this.form.controls.shareLevel.disable();
    }
    this.setAllControlsToInSync();
  }

  private setAllControlsToInSync(): void {
    this.controlStates.set('translationSuggestionsEnabled', ElementState.InSync);
    this.controlStates.set('sourceParatextId', ElementState.InSync);
    this.controlStates.set('checkingEnabled', ElementState.InSync);
    this.controlStates.set('usersSeeEachOthersResponses', ElementState.InSync);
    this.controlStates.set('shareEnabled', ElementState.InSync);
    this.controlStates.set('shareLevel', ElementState.InSync);
  }

  private updateNonSelectableProjects(): void {
    const source = this.projectDoc?.data?.translateConfig?.source;
    if (
      source != null &&
      (this.projects?.find(p => p.paratextId === source.paratextId) ||
        this.resources?.find(r => r.paratextId === source.paratextId)) == null
    ) {
      this.nonSelectableProjects = [{ paratextId: source.paratextId, name: source.name }];
    } else {
      this.nonSelectableProjects = [];
    }
  }
}
