import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { SFProjectDoc } from '../core/models/sf-project-doc';
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
  connectProjectForm = new FormGroup({
    paratextId: new FormControl(undefined),
    settings: new FormGroup({
      translationSuggestions: new FormControl(false),
      sourceParatextId: new FormControl(undefined),
      checking: new FormControl(false)
    })
  });
  projects: ParatextProject[] = null;
  sourceProjects: ParatextProject[];
  state: 'connecting' | 'loading' | 'input' | 'login';
  connectProjectName: string;

  private projectDoc: SFProjectDoc;
  private targetProjects: ParatextProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    noticeService: NoticeService
  ) {
    super(noticeService);
    this.connectProjectForm.disable();
  }

  get connectProgress(): number {
    return this.projectDoc == null ? undefined : this.projectDoc.data.sync.percentCompleted;
  }

  get connectPending(): boolean {
    return this.connectProgress == null;
  }

  get hasConnectableProjects(): boolean {
    return this.state === 'input' && this.targetProjects.length > 0;
  }

  get showSettings(): boolean {
    if (this.state !== 'input') {
      return false;
    }
    const paratextId: string = this.connectProjectForm.controls.paratextId.value;
    const project = this.projects.find(p => p.paratextId === paratextId);
    return project != null && project.projectId == null;
  }

  get hasNonAdministratorProject(): boolean {
    if (!this.projects) {
      return false;
    }
    return this.projects.filter(p => !p.isConnected && !p.isConnectable).length > 0;
  }

  get translationSuggestionsEnabled(): boolean {
    return this.connectProjectForm.get('settings.translationSuggestions').value;
  }

  ngOnInit(): void {
    this.loadingStarted();
    this.subscribe(this.connectProjectForm.controls.paratextId.valueChanges, (paratextId: string) => {
      if (this.state !== 'input') {
        return;
      }
      this.sourceProjects = this.projects.filter(p => p.paratextId !== paratextId);
      const settings = this.connectProjectForm.get('settings');
      if (this.showSettings) {
        settings.enable();
      } else {
        settings.disable();
      }
      if (!this.translationSuggestionsEnabled) {
        const sourceParatextId = settings.get('sourceParatextId');
        sourceParatextId.reset();
        sourceParatextId.disable();
      }
    });

    this.state = 'loading';
    this.subscribe(this.connectProjectForm.get('settings.translationSuggestions').valueChanges, (value: boolean) => {
      const sourceParatextId = this.connectProjectForm.get('settings.sourceParatextId');
      if (value) {
        sourceParatextId.enable();
      } else {
        sourceParatextId.reset();
        sourceParatextId.disable();
      }
    });

    this.subscribe(this.paratextService.getProjects(), projects => {
      if (projects != null) {
        projects.sort((a, b) => a.name.localeCompare(b.name));
      }
      this.projects = projects;
      if (projects != null) {
        this.targetProjects = projects.filter(p => p.isConnectable);
        this.state = 'input';
      } else {
        this.state = 'login';
      }
      this.connectProjectForm.enable();
      this.loadingFinished();
    });
  }

  logInWithParatext(): void {
    this.paratextService.linkParatext('/connect-project');
  }

  async submit(): Promise<void> {
    if (!this.connectProjectForm.valid) {
      return;
    }
    const values = this.connectProjectForm.value as ConnectProjectFormValues;
    const project = this.projects.find(p => p.paratextId === values.paratextId);
    if (project != null && project.projectId == null) {
      this.state = 'connecting';
      this.connectProjectName = project.name;
      const newProject: SFProject = {
        name: project.name,
        paratextId: project.paratextId,
        inputSystem: ParatextService.getInputSystem(project),
        checkingEnabled: values.settings.checking,
        translationSuggestionsEnabled: values.settings.translationSuggestions
      };
      if (values.settings.translationSuggestions) {
        const translateSourceProject = this.projects.find(p => p.paratextId === values.settings.sourceParatextId);
        newProject.sourceParatextId = translateSourceProject.paratextId;
        newProject.sourceName = translateSourceProject.name;
        newProject.sourceInputSystem = ParatextService.getInputSystem(translateSourceProject);
      }

      const projectId = await this.projectService.onlineCreate(newProject);
      this.projectDoc = await this.projectService.get(projectId);
      this.checkSyncStatus();
      this.subscribe(this.projectDoc.remoteChanges$, () => this.checkSyncStatus());
    } else {
      await this.projectService.onlineAddCurrentUser(project.projectId);
      this.router.navigate(['/projects', project.projectId]);
    }
  }

  private checkSyncStatus(): void {
    if (this.projectDoc.data.sync.queuedCount === 0) {
      this.router.navigate(['/projects', this.projectDoc.id]);
    }
  }
}
