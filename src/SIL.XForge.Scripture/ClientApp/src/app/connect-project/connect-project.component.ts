import { Component, ErrorHandler, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { MatSelectionList } from '@angular/material/list';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { compareProjectsForSorting, projectLabel } from '../shared/utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';

@Component({
  selector: 'app-connect-project',
  templateUrl: './connect-project.component.html',
  styleUrls: ['./connect-project.component.scss']
})
export class ConnectProjectComponent extends DataLoadingComponent implements OnInit {
  readonly connectProjectForm = new UntypedFormGroup({
    paratextId: new UntypedFormControl(undefined)
  });
  state: 'connecting' | 'loading' | 'input' | 'login' | 'offline' | 'configuring' = 'loading';
  connectProjectName?: string;
  projectDoc?: SFProjectDoc;
  @ViewChild('projectsUnconnectedList') projectsUnconnectedList?: MatSelectionList;
  projectLabel = projectLabel;

  private _isAppOnline: boolean = false;
  private _projects?: ParatextProject[];
  private targetProjects?: ParatextProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly userProjectsService: SFUserProjectsService,
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

  get paratextIdControl(): AbstractControl<any, any> {
    return this.connectProjectForm.controls.paratextId;
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

  get projectsConnected(): ParatextProject[] {
    return this.projects.filter(p => p.isConnected);
  }

  get projectsUnconnected(): ParatextProject[] {
    return this.projects.filter(p => !p.isConnected);
  }

  get projectDocs$(): Observable<SFProjectProfileDoc[]> {
    return this.userProjectsService.projectDocs$.pipe(
      map((list: SFProjectProfileDoc[]) => list.filter((s: SFProjectProfileDoc) => s.data?.paratextId.length === 40))
    );
  }

  switchToNewProjectState(): void {
    this.state = 'configuring';
  }

  ngOnInit(): void {
    this.state = 'loading';
    this.subscribe(this.pwaService.onlineStatus$, async isOnline => {
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

  goToProject(projectsList: MatSelectionList): void {
    const project = this.getSelectedProject(projectsList);
    if (project != null) {
      this.router.navigate(['/projects', project.projectId]);
    }
  }

  getSelectedProject(projectsList: MatSelectionList): ParatextProject | null {
    if (this._projects != null) {
      const selection = projectsList.selectedOptions.selected[0]?.value;
      const project = this._projects.find(p => p.paratextId === selection.paratextId);
      if (project != null) {
        return project;
      }
    }

    return null;
  }

  logInWithParatext(): void {
    this.paratextService.linkParatext('/connect-project');
  }

  translateFromSettings(key: string): string {
    return this.translocoService.translate(`settings.${key}`);
  }

  updateStatus(inProgress: boolean): void {
    if (!inProgress && this.projectDoc != null) {
      this.router.navigate(['/projects', this.projectDoc.id]);
    }
  }

  getTargetProject(): ParatextProject | undefined {
    if (this.projectsUnconnectedList != null) {
      const project = this.getSelectedProject(this.projectsUnconnectedList);
      if (project != null) {
        return project;
      }
    }

    return undefined;
  }

  private async populateProjectList(): Promise<void> {
    this.state = 'loading';
    this.loadingStarted();
    const projects = await this.paratextService.getProjects();

    if (projects == null) {
      this.state = 'login';
    } else {
      this._projects = projects.sort(compareProjectsForSorting);
      this.targetProjects = this._projects.filter(p => p.isConnectable);
      this.state = 'input';
    }
    this.loadingFinished();
  }
}
