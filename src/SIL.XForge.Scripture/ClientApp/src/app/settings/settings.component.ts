import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web/dialog';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
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
  translationSuggestionsEnabled = new FormControl(false);
  sourceParatextId = new FormControl(undefined);
  translateShareEnabled = new FormControl(false);
  translateShareLevel = new FormControl(undefined);
  checkingEnabled = new FormControl(false);
  usersSeeEachOthersResponses = new FormControl(false);
  checkingShareEnabled = new FormControl(false);
  checkingShareLevel = new FormControl(undefined);

  TranslateShareLevel = TranslateShareLevel;
  CheckingShareLevel = CheckingShareLevel;

  form = new FormGroup({
    translationSuggestionsEnabled: this.translationSuggestionsEnabled,
    sourceParatextId: this.sourceParatextId,
    translateShareEnabled: this.translateShareEnabled,
    translateShareLevel: this.translateShareLevel,
    checkingEnabled: this.checkingEnabled,
    usersSeeEachOthersResponses: this.usersSeeEachOthersResponses,
    checkingShareEnabled: this.checkingShareEnabled,
    checkingShareLevel: this.checkingShareLevel
  });

  isActiveSourceProject: boolean = false;
  projects?: ParatextProject[];
  resources?: SelectableProject[];
  nonSelectableProjects?: SelectableProject[];
  projectLoadingFailed = false;
  resourceLoadingFailed = false;

  mainSettingsLoaded = false;

  private static readonly projectSettingValueUnset = 'unset';
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
    this.loading = true;
  }

  get synchronizeWarning(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('settings.will_not_delete_paratext_project');
  }

  get shareDescription(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('settings.users_can_share_the_project');
  }

  get isBasedOnProjectSet(): boolean {
    return this.sourceParatextId.value != null;
  }

  get isLoggedInToParatext(): boolean {
    return this.projects != null;
  }

  get isTranslationSuggestionsEnabled(): boolean {
    return this.translationSuggestionsEnabled.value;
  }

  get isCheckingEnabled(): boolean {
    return this.checkingEnabled.value;
  }

  get projectId(): string {
    return this.projectDoc?.id || '';
  }

  get projectParatextId(): string | undefined {
    return this.projectDoc?.data?.paratextId;
  }

  set isAppOnline(isOnline: boolean) {
    this._isAppOnline = isOnline;
    this.updateFormEnabled();
  }

  get isAppOnline(): boolean {
    return this._isAppOnline;
  }

  get deleteButtonDisabled(): boolean {
    return !this.isAppOnline || !this.mainSettingsLoaded || this.isActiveSourceProject;
  }

  ngOnInit(): void {
    this.form.disable();
    this.form.valueChanges.subscribe(value => this.onFormValueChanges(value));
    this.setAllControlsToInSync();
    this.isAppOnline = this.pwaService.isOnline;
    const projectId$ = this.route.params.pipe(
      tap(() => (this.loading = this.isAppOnline)),
      map(params => params['projectId'] as string)
    );
    this.subscribe(combineLatest([this.pwaService.onlineStatus, projectId$]), async ([isOnline, projectId]) => {
      this.isAppOnline = isOnline;
      if (isOnline && this.projects == null) {
        this.loading = true;

        const mainSettingsPromise = Promise.all([
          this.projectService
            .onlineIsSourceProject(projectId)
            .then(isActiveSourceProject => (this.isActiveSourceProject = isActiveSourceProject)),
          this.projectService.get(projectId).then(projectDoc => (this.projectDoc = projectDoc))
        ]).then(() => {
          if (this.projectDoc != null) {
            this.updateSettingsInfo();
            this.updateNonSelectableProjects();
            this.subscribe(this.projectDoc.remoteChanges$, () => this.updateNonSelectableProjects());
            this.mainSettingsLoaded = true;
            this.updateFormEnabled();
          }
        });

        const projectsAndResourcesPromise = Promise.all([
          this.paratextService
            .getProjects()
            .then(projects => {
              this.projectLoadingFailed = false;
              this.projects = projects;
              this.updateNonSelectableProjects();
            })
            .catch(() => (this.projectLoadingFailed = true)),
          this.paratextService
            .getResources()
            .then(resources => {
              this.resourceLoadingFailed = false;
              this.resources = resources;
              this.updateNonSelectableProjects();
            })
            .catch(() => (this.resourceLoadingFailed = true))
        ]);

        await Promise.all([mainSettingsPromise, projectsAndResourcesPromise]);
        this.loading = false;

        this.updateFormEnabled();
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

  updateFormEnabled(): void {
    if (this._isAppOnline && this.mainSettingsLoaded) {
      this.form.enable();
      this.setIndividualControlDisabledStates();
    } else {
      this.form.disable();
    }
  }

  set loading(loading: boolean) {
    loading ? this.loadingStarted() : this.loadingFinished();
    this.updateFormEnabled();
  }

  private onFormValueChanges(newValue: SFProjectSettings): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }
    // Set status and include values for changed form items
    // Sometimes sourceParatextId is null | undefined for both new and previous values. A diff check needs to be made
    // but they also both need to be null when no value is set
    const sourceProjectChanged: boolean =
      (newValue.sourceParatextId ?? null) !== (this.previousFormValues.sourceParatextId ?? null);
    if (
      newValue.translationSuggestionsEnabled !== this.previousFormValues.translationSuggestionsEnabled &&
      this.translationSuggestionsEnabled.enabled
    ) {
      // Translation suggestions is set to false or is re-enabled
      this.updateSetting(newValue, 'translationSuggestionsEnabled');
      return;
    }
    // Check if the source project needs to be updated
    if (sourceProjectChanged) {
      const settings: SFProjectSettings = {
        sourceParatextId:
          newValue.sourceParatextId != null ? newValue.sourceParatextId : SettingsComponent.projectSettingValueUnset,
        // Keep this value consistent with the value of the form
        translationSuggestionsEnabled: this.previousFormValues.translationSuggestionsEnabled
      };
      if (newValue.sourceParatextId == null) {
        settings.translationSuggestionsEnabled = false;
      }
      const updateTaskPromise = this.projectService.onlineUpdateSettings(this.projectDoc.id, settings);
      this.checkUpdateStatus('sourceParatextId', updateTaskPromise);
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
    if (newValue.translateShareEnabled !== this.previousFormValues.translateShareEnabled) {
      this.updateSetting(newValue, 'translateShareEnabled');
      if (newValue.translateShareEnabled) {
        // when a control is disabled the value is undefined, so reset back to previous value
        this.previousFormValues.translateShareLevel = this.projectDoc.data.translateConfig.shareLevel;
        this.translateShareLevel.enable();
      } else {
        this.translateShareLevel.disable();
      }
    }
    if (newValue.checkingShareEnabled !== this.previousFormValues.checkingShareEnabled) {
      this.updateSetting(newValue, 'checkingShareEnabled');
      if (newValue.checkingShareEnabled) {
        // when a control is disabled the value is undefined, so reset back to previous value
        this.previousFormValues.checkingShareLevel = this.projectDoc.data.checkingConfig.shareLevel;
        this.checkingShareLevel.enable();
      } else {
        this.checkingShareLevel.disable();
      }
    }
    if (
      newValue.checkingShareLevel != null &&
      newValue.checkingShareLevel !== this.previousFormValues.checkingShareLevel &&
      this.checkingShareLevel.enabled
    ) {
      this.updateSetting(newValue, 'checkingShareLevel');
    }
    if (
      newValue.translateShareLevel != null &&
      newValue.translateShareLevel !== this.previousFormValues.translateShareLevel &&
      this.translateShareLevel.enabled
    ) {
      this.updateSetting(newValue, 'translateShareLevel');
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
      translateShareEnabled: !!this.projectDoc.data.translateConfig.shareEnabled,
      translateShareLevel: this.projectDoc.data.translateConfig.shareLevel,
      checkingEnabled: this.projectDoc.data.checkingConfig.checkingEnabled,
      usersSeeEachOthersResponses: this.projectDoc.data.checkingConfig.usersSeeEachOthersResponses,
      checkingShareEnabled: this.projectDoc.data.checkingConfig.shareEnabled,
      checkingShareLevel: this.projectDoc.data.checkingConfig.shareLevel
    };
    this.form.reset(this.previousFormValues);
    this.setIndividualControlDisabledStates();
    this.setAllControlsToInSync();
  }

  private setIndividualControlDisabledStates() {
    if (!this.isLoggedInToParatext && !this.isTranslationSuggestionsEnabled) {
      this.translationSuggestionsEnabled.disable();
    }
    if (!this.projectDoc?.data?.translateConfig.shareEnabled) {
      this.translateShareLevel.disable();
    }
    if (!this.projectDoc?.data?.checkingConfig.shareEnabled) {
      this.checkingShareLevel.disable();
    }
  }

  private setAllControlsToInSync(): void {
    this.controlStates.set('translationSuggestionsEnabled', ElementState.InSync);
    this.controlStates.set('sourceParatextId', ElementState.InSync);
    this.controlStates.set('translateShareEnabled', ElementState.InSync);
    this.controlStates.set('translateShareLevel', ElementState.InSync);
    this.controlStates.set('checkingEnabled', ElementState.InSync);
    this.controlStates.set('usersSeeEachOthersResponses', ElementState.InSync);
    this.controlStates.set('checkingShareEnabled', ElementState.InSync);
    this.controlStates.set('checkingShareLevel', ElementState.InSync);
  }

  private updateNonSelectableProjects(): void {
    const source = this.projectDoc?.data?.translateConfig?.source;
    if (
      source != null &&
      (this.projects?.find(p => p.paratextId === source.paratextId) ||
        this.resources?.find(r => r.paratextId === source.paratextId)) == null
    ) {
      this.nonSelectableProjects = [{ paratextId: source.paratextId, shortName: source.shortName, name: source.name }];
    } else {
      this.nonSelectableProjects = [];
    }
  }
}
