import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProject } from '../core/models/sfproject';
import { SFProjectDoc } from '../core/models/sfproject-doc';
import { SFProjectService } from '../core/sfproject.service';

interface ConnectProjectFormValues {
  paratextId: string;
  tasks: {
    checking: boolean;
    translate: boolean;
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
    tasks: new FormGroup({
      translate: new FormControl(true),
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

  get showTasks(): boolean {
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

  ngOnInit(): void {
    this.loadingStarted();
    this.subscribe(this.connectProjectForm.controls.paratextId.valueChanges, (paratextId: string) => {
      if (this.state !== 'input') {
        return;
      }
      this.sourceProjects = this.projects.filter(p => p.paratextId !== paratextId);
      const tasks = this.connectProjectForm.get('tasks');
      tasks.get('sourceParatextId').reset();
      if (this.showTasks) {
        tasks.enable();
        this.connectProjectForm.setValidators(
          XFValidators.requireOneWithValue(['tasks.translate', 'tasks.checking'], true)
        );
      } else {
        tasks.disable();
        this.connectProjectForm.clearValidators();
      }
    });

    this.state = 'loading';
    this.subscribe(this.connectProjectForm.get('tasks.translate').valueChanges, (value: boolean) => {
      const sourceParatextId = this.connectProjectForm.get('tasks.sourceParatextId');
      if (value) {
        sourceParatextId.enable();
      } else {
        sourceParatextId.reset();
        sourceParatextId.disable();
      }
    });

    this.subscribe(this.paratextService.getProjects(), projects => {
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
        projectName: project.name,
        paratextId: project.paratextId,
        inputSystem: ParatextService.getInputSystem(project),
        checkingEnabled: values.tasks.checking,
        translateEnabled: values.tasks.translate
      };
      if (values.tasks.translate) {
        const translateSourceProject = this.projects.find(p => p.paratextId === values.tasks.sourceParatextId);
        newProject.sourceParatextId = translateSourceProject.paratextId;
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
