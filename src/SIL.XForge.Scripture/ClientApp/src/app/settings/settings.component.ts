import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatDialogConfig } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ProjectType, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService, TextAroundTemplate } from 'xforge-common/i18n.service';
import { ElementState } from 'xforge-common/models/element-state';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { ExternalUrlService } from '../../xforge-common/external-url.service';
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
  sourceParatextId = new FormControl<string | undefined>(undefined);
  biblicalTermsEnabled = new FormControl(false);
  alternateSourceEnabled = new FormControl(false);
  alternateSourceParatextId = new FormControl<string | undefined>(undefined);
  alternateTrainingSourceEnabled = new FormControl(false);
  alternateTrainingSourceParatextId = new FormControl<string | undefined>(undefined);
  additionalTrainingSourceEnabled = new FormControl(false);
  additionalTrainingSourceParatextId = new FormControl<string | undefined>(undefined);
  additionalTrainingData = new FormControl(false);
  servalConfig = new FormControl<string | undefined>(undefined);
  checkingEnabled = new FormControl(false);
  usersSeeEachOthersResponses = new FormControl(false);
  checkingAnswerExport = new FormControl<CheckingAnswerExport | undefined>(undefined);
  hideCommunityCheckingText = new FormControl(false);
  translatorsShareEnabled = new FormControl(false);
  communityCheckersShareEnabled = new FormControl(false);
  commentersShareEnabled = new FormControl(false);
  viewersShareEnabled = new FormControl(false);

  // Expose enums to the template
  CheckingAnswerExport = CheckingAnswerExport;
  SFProjectRole = SFProjectRole;

  form = new FormGroup({
    translationSuggestionsEnabled: this.translationSuggestionsEnabled,
    sourceParatextId: this.sourceParatextId,
    biblicalTermsEnabled: this.biblicalTermsEnabled,
    alternateSourceEnabled: this.alternateSourceEnabled,
    alternateSourceParatextId: this.alternateSourceParatextId,
    alternateTrainingSourceEnabled: this.alternateTrainingSourceEnabled,
    alternateTrainingSourceParatextId: this.alternateTrainingSourceParatextId,
    additionalTrainingSourceEnabled: this.additionalTrainingSourceEnabled,
    additionalTrainingSourceParatextId: this.additionalTrainingSourceParatextId,
    additionalTrainingData: this.additionalTrainingData,
    servalConfig: this.servalConfig,
    checkingEnabled: this.checkingEnabled,
    usersSeeEachOthersResponses: this.usersSeeEachOthersResponses,
    checkingAnswerExport: this.checkingAnswerExport,
    hideCommunityCheckingText: this.hideCommunityCheckingText,
    translatorsShareEnabled: this.translatorsShareEnabled,
    communityCheckersShareEnabled: this.communityCheckersShareEnabled,
    commentersShareEnabled: this.commentersShareEnabled,
    viewersShareEnabled: this.viewersShareEnabled
  });

  isActiveSourceProject: boolean = false;
  isProjectSyncing: boolean = false;
  projects?: ParatextProject[];
  resources?: SelectableProject[];
  nonSelectableProjects?: SelectableProject[];
  projectLoadingFailed = false;
  resourceLoadingFailed = false;
  mainSettingsLoaded = false;

  private static readonly projectSettingValueUnset = 'unset';
  private paratextUsername: string | undefined;
  private projectDoc?: SFProjectDoc;
  /** Elements in this component and their states. */
  private controlStates = new Map<keyof SFProjectSettings, ElementState>();
  private previousFormValues: SFProjectSettings = {};
  private _isAppOnline: boolean = false;

  constructor(
    private readonly route: ActivatedRoute,
    noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly dialogService: DialogService,
    private readonly router: Router,
    private readonly onlineStatusService: OnlineStatusService,
    readonly i18n: I18nService,
    readonly authService: AuthService,
    readonly featureFlags: FeatureFlagService,
    readonly externalUrls: ExternalUrlService,
    private readonly activatedProjectService: ActivatedProjectService
  ) {
    super(noticeService);
    this.loading = true;
  }

  get synchronizeWarning(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('settings.will_not_delete_paratext_project');
  }

  get isBasedOnProjectSet(): boolean {
    return this.sourceParatextId.value != null;
  }

  get isLoggedInToParatext(): boolean {
    return this.paratextUsername != null;
  }

  get isTranslationSuggestionsEnabled(): boolean {
    return this.translationSuggestionsEnabled.value ?? false;
  }

  get isCheckingEnabled(): boolean {
    return this.checkingEnabled.value ?? false;
  }

  get isAlternateSourceEnabled(): boolean {
    return this.alternateSourceEnabled.value ?? false;
  }

  get isAlternateTrainingSourceEnabled(): boolean {
    return this.alternateTrainingSourceEnabled.value ?? false;
  }

  get isAdditionalTrainingSourceEnabled(): boolean {
    return this.additionalTrainingSourceEnabled.value ?? false;
  }

  get showPreTranslationSettings(): boolean {
    const translateConfig = this.projectDoc?.data?.translateConfig;
    if (translateConfig == null || !this.featureFlags.showNmtDrafting.enabled) {
      return false;
    } else if (this.authService.currentUserRoles.includes(SystemRole.ServalAdmin)) {
      return true;
    } else {
      return translateConfig.preTranslate === true && translateConfig.projectType !== ProjectType.BackTranslation;
    }
  }

  get projectId(): string {
    return this.activatedProjectService.projectId ?? '';
  }

  get projectParatextId(): string | undefined {
    return this.projectDoc?.data?.paratextId;
  }

  get biblicalTermsMessage(): string | undefined {
    return this.projectDoc?.data?.biblicalTermsConfig.errorMessage;
  }

  set isAppOnline(isOnline: boolean) {
    this._isAppOnline = isOnline;
    this.updateFormEnabled();
  }

  get isAppOnline(): boolean {
    return this._isAppOnline;
  }

  get deleteButtonDisabled(): boolean {
    return !this.isAppOnline || !this.mainSettingsLoaded || this.isActiveSourceProject || this.isProjectSyncing;
  }

  get canUpdateServalConfig(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.ServalAdmin);
  }

  ngOnInit(): void {
    this.form.disable();
    this.form.valueChanges.subscribe(value => this.onFormValueChanges(value));
    this.setAllControlsToInSync();
    this.isAppOnline = this.onlineStatusService.isOnline;
    const projectId$ = this.route.params.pipe(
      tap(() => (this.loading = this.isAppOnline)),
      map(params => params['projectId'] as string)
    );
    this.subscribe(
      combineLatest([this.onlineStatusService.onlineStatus$, projectId$]),
      async ([isOnline, projectId]) => {
        this.isAppOnline = isOnline;
        if (isOnline && this.projects == null) {
          this.loading = true;

          const mainSettingsPromise = Promise.all([
            this.projectService
              .onlineIsSourceProject(projectId)
              .then(isActiveSourceProject => (this.isActiveSourceProject = isActiveSourceProject)),
            firstValueFrom(this.paratextService.getParatextUsername()).then((username: string | undefined) => {
              if (username != null) this.paratextUsername = username;
            }),
            this.projectService.get(projectId).then(projectDoc => (this.projectDoc = projectDoc))
          ]).then(() => {
            if (this.projectDoc != null) {
              this.updateSettingsInfo();
              this.updateNonSelectableProjects();
              this.subscribe(this.projectDoc.remoteChanges$, () => {
                this.updateNonSelectableProjects();
                this.setIndividualControlDisabledStates();
              });
              this.mainSettingsLoaded = true;
              this.updateFormEnabled();
            }
          });

          let paratextTokensExpired = false;
          const projectsAndResourcesPromise = Promise.all([
            this.paratextService
              .getProjects()
              .then(projects => {
                this.projectLoadingFailed = false;
                this.projects = projects;
                this.updateNonSelectableProjects();
              })
              .catch((error: any) => {
                this.projectLoadingFailed = true;
                if (error instanceof HttpErrorResponse && error.status === 401) {
                  paratextTokensExpired = true;
                }
              }),
            this.paratextService
              .getResources()
              .then(resources => {
                this.resourceLoadingFailed = false;
                this.resources = resources;
                this.updateNonSelectableProjects();
              })
              .catch((error: any) => {
                this.resourceLoadingFailed = true;
                if (error instanceof HttpErrorResponse && error.status === 401) {
                  paratextTokensExpired = true;
                }
              })
          ]);

          await Promise.all([mainSettingsPromise, projectsAndResourcesPromise]);
          this.loading = false;

          if (paratextTokensExpired) this.authService.requestParatextCredentialUpdate();

          this.updateFormEnabled();
        }
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

    const config: MatDialogConfig<any> = { data: { name: this.projectDoc.data.name } };
    const dialogRef = this.dialogService.openMatDialog(DeleteProjectDialogComponent, config);
    dialogRef.afterClosed().subscribe(async result => {
      if (result === 'accept') {
        const user: UserDoc = await this.userService.getCurrentUser();
        await this.userService.setCurrentProjectId(user, undefined);
        if (this.projectDoc != null) {
          await this.projectService.onlineDelete(this.projectDoc.id);
          this.router.navigateByUrl('/projects', { replaceUrl: true });
        }
      }
    });
  }

  getControlState(setting: keyof SFProjectSettings): ElementState | undefined {
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

  updateServalConfig(): void {
    if (
      this.projectDoc?.data == null ||
      (this.form.value.servalConfig ?? '') === (this.projectDoc.data.translateConfig.draftConfig.servalConfig ?? '')
    ) {
      // Do not save if we do not have the project doc or if the configuration has not changed
      return;
    }

    // Update Serval Configuration
    const updateTaskPromise = this.projectService.onlineSetServalConfig(
      this.projectDoc.id,
      this.form.value.servalConfig
    );
    this.checkUpdateStatus('servalConfig', updateTaskPromise);
    this.previousFormValues = this.form.value;
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
    const sourceProjectChanged: boolean = this.settingChanged(newValue, 'sourceParatextId');
    if (this.settingChanged(newValue, 'translationSuggestionsEnabled') && this.translationSuggestionsEnabled.enabled) {
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

    if (this.settingChanged(newValue, 'biblicalTermsEnabled') && this.biblicalTermsMessage == null) {
      this.updateSetting(newValue, 'biblicalTermsEnabled');
      return;
    }

    // We only update the Serval config on blur
    if (this.settingChanged(newValue, 'servalConfig')) {
      return;
    }

    if (this.settingChanged(newValue, 'alternateSourceEnabled')) {
      this.updateSetting(newValue, 'alternateSourceEnabled');
    }

    // Check if the pre-translation alternate source project needs to be updated
    if (this.settingChanged(newValue, 'alternateSourceParatextId')) {
      const settings: SFProjectSettings = {
        alternateSourceParatextId: newValue.alternateSourceParatextId ?? SettingsComponent.projectSettingValueUnset
      };
      const updateTaskPromise = this.projectService.onlineUpdateSettings(this.projectDoc.id, settings);
      this.checkUpdateStatus('alternateSourceParatextId', updateTaskPromise);
      this.previousFormValues = newValue;
      return;
    }

    if (this.settingChanged(newValue, 'alternateTrainingSourceEnabled')) {
      this.updateSetting(newValue, 'alternateTrainingSourceEnabled');
    }

    if (this.settingChanged(newValue, 'additionalTrainingData')) {
      this.updateSetting(newValue, 'additionalTrainingData');
    }

    // Check if the pre-translation alternate training source project needs to be updated
    if (this.settingChanged(newValue, 'alternateTrainingSourceParatextId')) {
      const settings: SFProjectSettings = {
        alternateTrainingSourceParatextId:
          newValue.alternateTrainingSourceParatextId ?? SettingsComponent.projectSettingValueUnset
      };
      const updateTaskPromise = this.projectService.onlineUpdateSettings(this.projectDoc.id, settings);
      this.checkUpdateStatus('alternateTrainingSourceParatextId', updateTaskPromise);
      this.previousFormValues = newValue;
      return;
    }

    if (this.settingChanged(newValue, 'additionalTrainingSourceEnabled', false)) {
      this.updateSetting(newValue, 'additionalTrainingSourceEnabled');
    }

    // Check if the pre-translation additional training sources project needs to be updated
    if (this.settingChanged(newValue, 'additionalTrainingSourceParatextId')) {
      const settings: SFProjectSettings = {
        additionalTrainingSourceParatextId:
          newValue.additionalTrainingSourceParatextId ?? SettingsComponent.projectSettingValueUnset
      };
      const updateTaskPromise = this.projectService.onlineUpdateSettings(this.projectDoc.id, settings);
      this.checkUpdateStatus('additionalTrainingSourceParatextId', updateTaskPromise);
      this.previousFormValues = newValue;
      return;
    }

    this.updateCheckingConfig(newValue);

    // Update the sharing settings
    this.updateSharingSetting(newValue, 'translatorsShareEnabled', SFProjectRole.ParatextTranslator);
    this.updateSharingSetting(newValue, 'communityCheckersShareEnabled', SFProjectRole.CommunityChecker);
    this.updateSharingSetting(newValue, 'commentersShareEnabled', SFProjectRole.Commenter);
    this.updateSharingSetting(newValue, 'viewersShareEnabled', SFProjectRole.Viewer);
  }

  private settingChanged(
    newValue: SFProjectSettings,
    setting: keyof SFProjectSettings,
    undefinedValue: null | boolean = null
  ): boolean {
    return (newValue[setting] ?? undefinedValue) !== (this.previousFormValues[setting] ?? undefinedValue);
  }

  private updateSetting(newValue: SFProjectSettings, setting: keyof SFProjectSettings): void {
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
    if (this.settingChanged(newValue, 'checkingEnabled')) {
      this.updateSetting(newValue, 'checkingEnabled');
    }
    if (this.settingChanged(newValue, 'usersSeeEachOthersResponses')) {
      this.updateSetting(newValue, 'usersSeeEachOthersResponses');
    }
    if (
      newValue.checkingAnswerExport != null &&
      newValue.checkingAnswerExport !== this.previousFormValues.checkingAnswerExport
    ) {
      this.updateSetting(newValue, 'checkingAnswerExport');
    }
    if (this.settingChanged(newValue, 'hideCommunityCheckingText')) {
      this.updateSetting(newValue, 'hideCommunityCheckingText');
    }
  }

  private updateSharingSetting(
    newValue: SFProjectSettings,
    setting: keyof SFProjectSettings,
    role: SFProjectRole
  ): void {
    if (this.settingChanged(newValue, setting)) {
      const right = SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create);
      const permissions = new Set(this.projectDoc.data.rolePermissions[role] ?? []);
      if (newValue[setting] === true) {
        permissions.add(right);
      } else {
        permissions.delete(right);
      }

      this.checkUpdateStatus(
        setting,
        this.projectService.onlineSetRoleProjectPermissions(this.projectDoc.id, role, Array.from(permissions))
      );
      this.previousFormValues = this.form.value;
    }
  }

  private checkUpdateStatus(setting: keyof SFProjectSettings, updatePromise: Promise<void>): void {
    this.controlStates.set(setting, ElementState.Submitting);
    updatePromise
      .then(() => this.controlStates.set(setting, ElementState.Submitted))
      .catch(() => this.controlStates.set(setting, ElementState.Error));
  }

  private updateSettingsInfo(): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }
    this.previousFormValues = {
      translationSuggestionsEnabled: this.projectDoc.data.translateConfig.translationSuggestionsEnabled,
      sourceParatextId: this.projectDoc.data.translateConfig.source?.paratextId,
      biblicalTermsEnabled: this.projectDoc.data.biblicalTermsConfig.biblicalTermsEnabled,
      alternateSourceEnabled: this.projectDoc.data.translateConfig.draftConfig.alternateSourceEnabled,
      alternateSourceParatextId: this.projectDoc.data.translateConfig.draftConfig?.alternateSource?.paratextId,
      alternateTrainingSourceEnabled: this.projectDoc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled,
      alternateTrainingSourceParatextId:
        this.projectDoc.data.translateConfig.draftConfig?.alternateTrainingSource?.paratextId,
      additionalTrainingSourceEnabled: this.projectDoc.data.translateConfig.draftConfig.additionalTrainingSourceEnabled,
      additionalTrainingSourceParatextId:
        this.projectDoc.data.translateConfig.draftConfig?.additionalTrainingSource?.paratextId,
      additionalTrainingData: this.projectDoc.data.translateConfig.draftConfig.additionalTrainingData,
      servalConfig: this.projectDoc.data.translateConfig.draftConfig.servalConfig,
      checkingEnabled: this.projectDoc.data.checkingConfig.checkingEnabled,
      usersSeeEachOthersResponses: this.projectDoc.data.checkingConfig.usersSeeEachOthersResponses,
      hideCommunityCheckingText: this.projectDoc.data.checkingConfig.hideCommunityCheckingText,
      translatorsShareEnabled:
        this.projectDoc.data.rolePermissions[SFProjectRole.ParatextTranslator]?.includes(
          SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
        ) === true,
      communityCheckersShareEnabled:
        this.projectDoc.data.rolePermissions[SFProjectRole.CommunityChecker]?.includes(
          SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
        ) === true,
      commentersShareEnabled:
        this.projectDoc.data.rolePermissions[SFProjectRole.Commenter]?.includes(
          SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
        ) === true,
      viewersShareEnabled:
        this.projectDoc.data.rolePermissions[SFProjectRole.Viewer]?.includes(
          SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
        ) === true,
      checkingAnswerExport: this.projectDoc.data.checkingConfig.answerExportMethod ?? CheckingAnswerExport.All
    };
    this.form.reset(this.previousFormValues);
    this.setIndividualControlDisabledStates();
    this.setAllControlsToInSync();
  }

  private setIndividualControlDisabledStates(): void {
    if (!this.isLoggedInToParatext && !this.isTranslationSuggestionsEnabled) {
      this.translationSuggestionsEnabled.disable();
    }

    if (this.projectDoc?.data?.biblicalTermsConfig.errorMessage == null) {
      this.biblicalTermsEnabled.enable({ onlySelf: true });
    } else {
      this.biblicalTermsEnabled.disable({ onlySelf: true });
    }

    this.isProjectSyncing = (this.projectDoc?.data?.sync?.queuedCount ?? 0) > 0;
  }

  private setAllControlsToInSync(): void {
    this.controlStates.set('translationSuggestionsEnabled', ElementState.InSync);
    this.controlStates.set('sourceParatextId', ElementState.InSync);
    this.controlStates.set('biblicalTermsEnabled', ElementState.InSync);
    this.controlStates.set('alternateSourceEnabled', ElementState.InSync);
    this.controlStates.set('alternateSourceParatextId', ElementState.InSync);
    this.controlStates.set('alternateTrainingSourceEnabled', ElementState.InSync);
    this.controlStates.set('alternateTrainingSourceParatextId', ElementState.InSync);
    this.controlStates.set('additionalTrainingSourceEnabled', ElementState.InSync);
    this.controlStates.set('additionalTrainingSourceParatextId', ElementState.InSync);
    this.controlStates.set('additionalTrainingData', ElementState.InSync);
    this.controlStates.set('servalConfig', ElementState.InSync);
    this.controlStates.set('checkingEnabled', ElementState.InSync);
    this.controlStates.set('usersSeeEachOthersResponses', ElementState.InSync);
    this.controlStates.set('hideCommunityCheckingText', ElementState.InSync);
    this.controlStates.set('checkingAnswerExport', ElementState.InSync);
    this.controlStates.set('translatorsShareEnabled', ElementState.InSync);
    this.controlStates.set('communityCheckersShareEnabled', ElementState.InSync);
    this.controlStates.set('commentersShareEnabled', ElementState.InSync);
    this.controlStates.set('viewersShareEnabled', ElementState.InSync);
  }

  private updateNonSelectableProjects(): void {
    this.nonSelectableProjects = [];
    this.addNonSelectableProject(this.projectDoc?.data?.translateConfig?.source);
    this.addNonSelectableProject(this.projectDoc?.data?.translateConfig?.draftConfig?.alternateSource);
    this.addNonSelectableProject(this.projectDoc?.data?.translateConfig?.draftConfig?.alternateTrainingSource);
    this.addNonSelectableProject(this.projectDoc?.data?.translateConfig?.draftConfig?.additionalTrainingSource);
  }

  private addNonSelectableProject(project?: TranslateSource): void {
    if (
      project != null &&
      (this.projects?.find(p => p.paratextId === project.paratextId) ||
        this.resources?.find(r => r.paratextId === project.paratextId)) == null
    ) {
      this.nonSelectableProjects?.push({
        paratextId: project.paratextId,
        shortName: project.shortName,
        name: project.name
      });
    }
  }
}
