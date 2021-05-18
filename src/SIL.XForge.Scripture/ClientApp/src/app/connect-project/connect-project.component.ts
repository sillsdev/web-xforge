import { Component, ErrorHandler, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectCreateSettings } from '../core/models/sf-project-create-settings';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { ParatextService, SelectableProject } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';

interface ConnectProjectFormValues {
  paratextId: string;
  settings: {
    checking: boolean;
    translationSuggestions: boolean;
    sourceParatextId: string;
  };
}

@Component({
  selector: 'app-connect-project',
  templateUrl: './connect-project.component.html',
  styleUrls: ['./connect-project.component.scss']
})
export class ConnectProjectComponent extends DataLoadingComponent implements OnInit {
  static readonly errorAlreadyConnectedKey: string = 'error-already-connected';
  readonly connectProjectForm = new FormGroup({
    paratextId: new FormControl(undefined),
    settings: new FormGroup({
      translationSuggestions: new FormControl(false),
      sourceParatextId: new FormControl(undefined),
      checking: new FormControl(true)
    })
  });
  resources?: SelectableProject[];
  state: 'connecting' | 'loading' | 'input' | 'login' | 'offline' = 'loading';
  connectProjectName?: string;
  projectDoc?: SFProjectDoc;

  private _isAppOnline: boolean = false;
  private _projects?: ParatextProject[];
  private targetProjects?: ParatextProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    readonly i18n: I18nService,
    noticeService: NoticeService,
    private readonly pwaService: PwaService,
    private readonly errorHandler: ErrorHandler,
    private readonly translocoService: TranslocoService
  ) {
    super(noticeService);
    this.connectProjectForm.disable();
  }

  get hasConnectableProjects(): boolean {
    return this.state === 'input' && this.targetProjects != null && this.targetProjects.length > 0;
  }

  set isAppOnline(isOnline: boolean) {
    isOnline ? this.connectProjectForm.enable() : this.connectProjectForm.disable();
    this._isAppOnline = isOnline;
  }

  get isAppOnline(): boolean {
    return this._isAppOnline;
  }

  get paratextIdControl() {
    return this.connectProjectForm.controls.paratextId;
  }

  get showSettings(): boolean {
    if (this.state !== 'input' || this._projects == null) {
      return false;
    }
    const paratextId: string = this.paratextIdControl.value;
    const project = this._projects.find(p => p.paratextId === paratextId);
    return project != null && project.projectId == null;
  }

  get submitDisabled(): boolean {
    return !this.hasConnectableProjects || !this.isAppOnline;
  }

  get hasNonAdministratorProject(): boolean {
    if (!this._projects) {
      return false;
    }
    return this._projects.filter(p => !p.isConnected && !p.isConnectable).length > 0;
  }

  get projects(): ParatextProject[] {
    return this._projects != null ? this._projects : [];
  }

  get translationSuggestionsEnabled(): boolean {
    return this.settings.controls.translationSuggestions.value;
  }

  get settings(): FormGroup {
    return this.connectProjectForm.controls.settings as FormGroup;
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
      if (!this.translationSuggestionsEnabled) {
        const sourceParatextId = this.settings.controls.sourceParatextId;
        sourceParatextId.reset();
        sourceParatextId.disable();
      }
    });

    this.state = 'loading';
    this.subscribe(this.settings.controls.translationSuggestions.valueChanges, (value: boolean) => {
      const sourceParatextId = this.settings.controls.sourceParatextId;
      if (value) {
        sourceParatextId.enable();
      } else {
        sourceParatextId.reset();
        sourceParatextId.disable();
      }
    });

    this.subscribe(this.pwaService.onlineStatus, async isOnline => {
      this.isAppOnline = isOnline;
      if (isOnline) {
        if (this._projects == null) {
          await this.populateProjectList();
        } else {
          this.state = 'input';
        }
      } else {
        this.state = 'offline';
      }
    });
  }

  logInWithParatext(): void {
    this.paratextService.linkParatext('/connect-project');
  }

  async submit(): Promise<void> {
    // Set the validator when the user tries to submit the form to prevent the select immediately being invalid
    // when the user clicks it. Marking it untouched does not appear to work.
    this.paratextIdControl.setValidators(Validators.required);
    this.paratextIdControl.updateValueAndValidity();
    if (this.translationSuggestionsEnabled) {
      this.settings.controls.sourceParatextId.setValidators(Validators.required);
      this.settings.controls.sourceParatextId.updateValueAndValidity();
    }
    if (!this.connectProjectForm.valid || this._projects == null) {
      return;
    }
    const values = this.connectProjectForm.value as ConnectProjectFormValues;
    const project = this._projects.find(p => p.paratextId === values.paratextId);
    if (project == null) {
      return;
    }
    this.state = 'connecting';
    if (project.projectId == null) {
      this.connectProjectName = project.name;
      const settings: SFProjectCreateSettings = {
        paratextId: project.paratextId,
        checkingEnabled: values.settings.checking,
        translationSuggestionsEnabled: values.settings.translationSuggestions,
        sourceParatextId: values.settings.sourceParatextId
      };

      let projectId: string = '';
      try {
        projectId = await this.projectService.onlineCreate(settings);
      } catch (err) {
        if (!err.message?.includes(ConnectProjectComponent.errorAlreadyConnectedKey)) {
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

  updateStatus(inProgress: boolean): void {
    if (!inProgress && this.projectDoc != null) {
      this.router.navigate(['/projects', this.projectDoc.id]);
    }
  }

  private async populateProjectList() {
    this.state = 'loading';
    this.loadingStarted();
    [this._projects, this.resources] = await this.paratextService.getProjectsAndResources();
    if (this._projects != null) {
      this.targetProjects = this._projects.filter(p => p.isConnectable);
      this.state = 'input';
    } else {
      this.state = 'login';
    }
    this.loadingFinished();
  }
}
