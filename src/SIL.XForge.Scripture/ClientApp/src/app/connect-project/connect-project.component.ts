import { Component, ErrorHandler, OnInit } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { hasStringProp } from '../../type-utils';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectCreateSettings } from '../core/models/sf-project-create-settings';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { ParatextService, SelectableProject } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { compareProjectsForSorting, projectLabel } from '../shared/utils';

interface ConnectProjectFormValues {
  paratextId: string;
  settings: {
    checking: boolean;
    translationSuggestions: boolean;
    sourceParatextId: string;
  };
}

/** Page allowing user to connect a Paratext project to SF for the first time, or join a project that another user has
 * already connected. */
@Component({
  selector: 'app-connect-project',
  templateUrl: './connect-project.component.html',
  styleUrls: ['./connect-project.component.scss']
})
export class ConnectProjectComponent extends DataLoadingComponent implements OnInit {
  static readonly errorAlreadyConnectedKey: string = 'error-already-connected';
  readonly connectProjectForm = new UntypedFormGroup({
    paratextId: new UntypedFormControl(undefined),
    settings: new UntypedFormGroup({
      translationSuggestions: new UntypedFormControl(false),
      sourceParatextId: new UntypedFormControl(undefined),
      checking: new UntypedFormControl(true)
    })
  });
  resources?: SelectableProject[];
  showResourcesLoadingFailedMessage = false;
  state: 'connecting' | 'loading' | 'input' | 'login' | 'offline' = 'loading';
  connectProjectName?: string;
  projectDoc?: SFProjectDoc;
  /** The Paratext project id of what was requested to connect. */
  incomingPTProjectId?: string;

  projectLabel = projectLabel;

  private _isAppOnline: boolean = false;
  private _userPTProjects?: ParatextProject[];
  private connectableProjects?: ParatextProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    readonly i18n: I18nService,
    noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly errorHandler: ErrorHandler,
    private readonly translocoService: TranslocoService
  ) {
    super(noticeService);
    this.connectProjectForm.disable();
    this.incomingPTProjectId = this.router.getCurrentNavigation()?.extras.state?.ptProjectId;
  }

  set isAppOnline(isOnline: boolean) {
    isOnline ? this.connectProjectForm.enable() : this.connectProjectForm.disable();
    this._isAppOnline = isOnline;
  }

  get isAppOnline(): boolean {
    return this._isAppOnline;
  }

  get paratextIdControl(): AbstractControl<any, any> {
    // todo delete this getter.
    return this.connectProjectForm.controls.paratextId;
  }

  get showSettings(): boolean {
    if (this.state !== 'input' || this._userPTProjects == null) {
      return false;
    }
    if (!this.usablePTProjectIdRequested) return false;
    if (this.incomingPTProjectId == null) return false;
    const paratextId: string = this.incomingPTProjectId;
    const project = this._userPTProjects.find(p => p.paratextId === paratextId);
    return project != null && !this.paratextService.isParatextProjectInSF(project);
  }

  get usablePTProjectIdRequested(): boolean {
    if (this.incomingPTProjectId == null) return false;
    const requestedPTProject: ParatextProject | undefined = this.userPTProjects.find(
      p => p.paratextId === this.incomingPTProjectId
    );
    // Check if the user has access to the PT project at all.
    if (requestedPTProject == null) return false;
    // Check if the user can Join or Connect the PT project.
    const canJoin: boolean = requestedPTProject.projectId != null;
    const canConnect: boolean = requestedPTProject.isConnectable;
    return canJoin || canConnect;
  }

  get submitDisabled(): boolean {
    if (!this.usablePTProjectIdRequested) return true;
    return !this.isAppOnline;
  }

  get hasNonAdministratorProject(): boolean {
    if (!this._userPTProjects) {
      return false;
    }
    return this._userPTProjects.filter(p => !p.isConnected && !p.isConnectable).length > 0;
  }

  get isBasedOnProjectSet(): boolean {
    return this.settings.controls.sourceParatextId.value != null;
  }

  get userPTProjects(): ParatextProject[] {
    return this._userPTProjects != null ? this._userPTProjects : [];
  }

  get translationSuggestionsEnabled(): boolean {
    return this.settings.controls.translationSuggestions.value;
  }

  get settings(): UntypedFormGroup {
    return this.connectProjectForm.controls.settings as UntypedFormGroup;
  }

  ngOnInit(): void {
    this.subscribe(this.paratextIdControl.valueChanges, () => {
      if (this.state !== 'input') {
        return;
      }
      if (this.showSettings) {
        this.settings.enable();
      } else {
        this.settings.disable();
      }
      if (!this.isBasedOnProjectSet) {
        const translationSuggestions = this.settings.controls.translationSuggestions;
        translationSuggestions.reset();
        translationSuggestions.disable();
      }
    });

    this.state = 'loading';
    this.subscribe(this.settings.controls.sourceParatextId.valueChanges, (value: boolean) => {
      const translationSuggestions = this.settings.controls.translationSuggestions;
      if (value) {
        translationSuggestions.enable();
      } else {
        translationSuggestions.reset();
        translationSuggestions.disable();
      }
    });

    this.subscribe(this.onlineStatusService.onlineStatus$, async isOnline => {
      this.isAppOnline = isOnline;
      if (isOnline) {
        if (this._userPTProjects == null) {
          await this.populateProjectList();
        } else {
          this.state = 'input';
        }
      } else {
        this.state = 'offline';
      }
    });

    if (this.incomingPTProjectId != null) this.paratextIdControl.setValue(this.incomingPTProjectId);
  }

  logInWithParatext(): void {
    this.paratextService.linkParatext('/connect-project');
  }

  async submit(): Promise<void> {
    // Set the validator when the user tries to submit the form to prevent the select immediately being invalid
    // when the user clicks it. Marking it untouched does not appear to work.
    this.paratextIdControl.setValidators(Validators.required);
    this.paratextIdControl.updateValueAndValidity();
    if (!this.connectProjectForm.valid || this._userPTProjects == null) {
      return;
    }
    const values = this.connectProjectForm.value as ConnectProjectFormValues;
    const project = this._userPTProjects.find(p => p.paratextId === values.paratextId);
    if (project == null) {
      return;
    }
    this.state = 'connecting';
    if (project.projectId == null) {
      this.connectProjectName = project.name;
      const settings: SFProjectCreateSettings = {
        paratextId: project.paratextId,
        checkingEnabled: values.settings.checking,
        translationSuggestionsEnabled: values.settings.translationSuggestions ?? false,
        sourceParatextId: values.settings.sourceParatextId
      };

      let projectId: string = '';
      try {
        projectId = await this.projectService.onlineCreate(settings);
      } catch (err) {
        if (!hasStringProp(err, 'message') || !err.message.includes(ConnectProjectComponent.errorAlreadyConnectedKey)) {
          throw err;
        }

        err.message = this.translocoService.translate('connect_project.problem_already_connected');
        this.errorHandler.handleError(err);
        this.state = 'input';
        this.populateProjectList();
        return;
      }
      this.projectDoc = await this.projectService.get(projectId);
    } else {
      await this.projectService.onlineAddCurrentUser(project.projectId);
      this.router.navigate(['/projects', project.projectId]);
    }
  }

  translateFromSettings(key: string): string {
    return this.translocoService.translate(`settings.${key}`);
  }

  updateStatus(inProgress: boolean): void {
    if (!inProgress && this.projectDoc != null) {
      this.router.navigate(['/projects', this.projectDoc.id]);
    }
  }

  private async populateProjectList(): Promise<void> {
    this.state = 'loading';
    this.loadingStarted();
    const resourceFetchPromise = this.fetchResources();
    const projects = await this.paratextService.getProjects();

    if (projects == null) {
      this.state = 'login';
    } else {
      this._userPTProjects = projects.sort(compareProjectsForSorting);
      this.connectableProjects = this._userPTProjects.filter(p => p.isConnectable);
      this.state = 'input';
      await resourceFetchPromise;
    }
    this.loadingFinished();
  }

  private async fetchResources(): Promise<void> {
    try {
      this.resources = await this.paratextService.getResources();
      this.showResourcesLoadingFailedMessage = false;
    } catch {
      this.showResourcesLoadingFailedMessage = true;
    }
  }
}
