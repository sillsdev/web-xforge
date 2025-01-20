import { HttpErrorResponse } from '@angular/common/http';
import { Component, ErrorHandler, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { AuthService } from 'xforge-common/auth.service';
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
  settings: {
    checking: boolean;
    sourceParatextId: string | null;
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
    settings: new FormGroup({
      sourceParatextId: new FormControl(undefined),
      checking: new FormControl(true)
    })
  });
  resources?: SelectableProject[];
  showResourcesLoadingFailedMessage = false;
  state: 'connecting' | 'input' | 'offline' = 'input';
  projectDoc?: SFProjectDoc;

  projectLabel = projectLabel;

  private _isAppOnline: boolean = false;
  private projectsFromParatext?: ParatextProject[];
  private projectMetadata?: SelectableProject;

  constructor(
    private readonly authService: AuthService,
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
    this.projectMetadata = {
      paratextId: this.router.getCurrentNavigation()?.extras.state?.paratextId ?? '',
      name: this.router.getCurrentNavigation()?.extras.state?.name ?? '',
      shortName: this.router.getCurrentNavigation()?.extras.state?.shortName ?? ''
    };
  }

  set isAppOnline(isOnline: boolean) {
    isOnline ? this.connectProjectForm.enable() : this.connectProjectForm.disable();
    this._isAppOnline = isOnline;
  }

  get isAppOnline(): boolean {
    return this._isAppOnline;
  }

  get showSettings(): boolean {
    return this.state === 'input';
  }

  get submitDisabled(): boolean {
    return this.projectsFromParatext == null || !this.isAppOnline;
  }

  get isBasedOnProjectSet(): boolean {
    return this.settings.controls.sourceParatextId.value != null;
  }

  get projects(): ParatextProject[] {
    return this.projectsFromParatext ?? [];
  }

  get settings(): FormGroup {
    return this.connectProjectForm.controls.settings as FormGroup;
  }

  get ptProjectId(): string {
    return this.projectMetadata?.paratextId ?? '';
  }

  get projectTitle(): string {
    if (this.projectMetadata == null) return '';
    return projectLabel(this.projectMetadata);
  }

  ngOnInit(): void {
    this.state = 'input';
    if (this.ptProjectId === '') {
      this.router.navigate(['/projects']);
    }

    this.subscribe(this.onlineStatusService.onlineStatus$, async isOnline => {
      this.isAppOnline = isOnline;
      if (isOnline) {
        if (this.projectsFromParatext == null) {
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
    if (!this.connectProjectForm.valid || this.projectsFromParatext == null) {
      return;
    }
    const values: ConnectProjectFormValues = {
      settings: {
        checking: !!this.connectProjectForm.value.settings?.checking,
        sourceParatextId: this.connectProjectForm.value.settings?.sourceParatextId ?? null
      }
    };
    this.state = 'connecting';
    const settings: SFProjectCreateSettings = {
      paratextId: this.ptProjectId,
      checkingEnabled: values.settings.checking,
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
  }

  updateStatus(inProgress: boolean): void {
    if (!inProgress && this.projectDoc != null) {
      this.router.navigate(['/projects', this.projectDoc.id]);
    }
  }

  private async populateProjectList(): Promise<void> {
    this.state = 'input';
    this.loadingStarted();

    try {
      const projects: ParatextProject[] | undefined = (await this.paratextService.getProjects()) ?? [];
      this.projectsFromParatext = projects.sort(compareProjectsForSorting);
      // do not wait for resources to load
      this.fetchResources();
    } catch (error: any) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.authService.requestParatextCredentialUpdate(() => this.router.navigate(['/projects']));
      } else {
        throw error;
      }
    } finally {
      this.loadingFinished();
    }
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
