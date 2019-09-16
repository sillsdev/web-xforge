import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ParatextService } from 'src/app/core/paratext.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectCreateSettings } from '../core/models/sf-project-create-settings';
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

  get paratextIdControl() {
    return this.connectProjectForm.controls.paratextId;
  }

  get sourceParatextIdControl() {
    return this.connectProjectForm.get('settings.sourceParatextId');
  }

  get showSettings(): boolean {
    if (this.state !== 'input') {
      return false;
    }
    const paratextId: string = this.paratextIdControl.value;
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
    this.subscribe(this.paratextIdControl.valueChanges, (paratextId: string) => {
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
    // Set the validator when the user tries to submit the form to prevent the select immediately being invalid
    // when the user clicks it. Marking it untouched does not appear to work.
    this.paratextIdControl.setValidators(Validators.required);
    this.paratextIdControl.updateValueAndValidity();
    if (this.translationSuggestionsEnabled) {
      this.sourceParatextIdControl.setValidators(Validators.required);
      this.sourceParatextIdControl.updateValueAndValidity();
    }
    if (!this.connectProjectForm.valid) {
      return;
    }
    const values = this.connectProjectForm.value as ConnectProjectFormValues;
    const project = this.projects.find(p => p.paratextId === values.paratextId);
    if (project != null && project.projectId == null) {
      this.state = 'connecting';
      this.connectProjectName = project.name;
      const settings: SFProjectCreateSettings = {
        paratextId: project.paratextId,
        checkingEnabled: values.settings.checking,
        translationSuggestionsEnabled: values.settings.translationSuggestions,
        sourceParatextId: values.settings.sourceParatextId
      };

      const projectId = await this.projectService.onlineCreate(settings);
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
