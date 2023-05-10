import { Component, ErrorHandler, Input, OnInit } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { ParatextService, SelectableProject } from 'src/app/core/paratext.service';
import { SFProjectDoc } from 'src/app/core/models/sf-project-doc';
import { ParatextProject } from 'src/app/core/models/paratext-project';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { SFProjectCreateSettings } from 'src/app/core/models/sf-project-create-settings';
import { hasStringProp } from 'src/type-utils';
import { projectLabel } from '../../shared/utils';

interface ConnectProjectFormValues {
  paratextId: string;
  settings: {
    checking: boolean;
    translationSuggestions: boolean;
    sourceParatextId: string;
  };
}

@Component({
  selector: 'app-new-project',
  templateUrl: './new-project.component.html',
  styleUrls: ['./new-project.component.scss']
})
export class NewProjectComponent extends DataLoadingComponent implements OnInit {
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
  state: 'connecting' | 'loading' | 'input' | 'login' | 'offline' | 'configuring' = 'loading';
  connectProjectName?: string;
  projectDoc?: SFProjectDoc;
  @Input() targetProject?: ParatextProject | undefined;
  @Input() projects?: ParatextProject[];
  projectLabel = projectLabel;

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
  }

  ngOnInit(): void {
    this.state = 'loading';
    this.loadingStarted();

    this.fetchResources();
    this.subscribe(this.settings.controls.sourceParatextId.valueChanges, (value: boolean) => {
      const translationSuggestions = this.settings.controls.translationSuggestions;
      if (value) {
        translationSuggestions.enable();
      } else {
        translationSuggestions.reset();
        translationSuggestions.disable();
      }
    });

    this.loadingFinished();
    this.state = 'input';
  }

  get settings(): UntypedFormGroup {
    return this.connectProjectForm.controls.settings as UntypedFormGroup;
  }

  get isBasedOnProjectSet(): boolean {
    return this.settings.controls.sourceParatextId.value != null;
  }

  get translationSuggestionsEnabled(): boolean {
    return this.settings.controls.translationSuggestions.value;
  }

  get paratextIdControl(): AbstractControl<any, any> {
    return this.connectProjectForm.controls.paratextId;
  }

  async submit(): Promise<void> {
    // Set the validator when the user tries to submit the form to prevent the select immediately being invalid
    // when the user clicks it. Marking it untouched does not appear to work.
    this.paratextIdControl.setValidators(Validators.required);
    this.paratextIdControl.updateValueAndValidity();
    if (!this.connectProjectForm.valid || this.projects == null) {
      return;
    }
    const values = this.connectProjectForm.value as ConnectProjectFormValues;
    const project = this.projects.find(p => p.paratextId === values.paratextId);
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
        if (!hasStringProp(err, 'message') || !err.message.includes(NewProjectComponent.errorAlreadyConnectedKey)) {
          throw err;
        }

        //todo error handling

        err.message = this.translocoService.translate('connect_project.problem_already_connected');
        this.errorHandler.handleError(err);
        this.state = 'input';
        // this.populateProjectList();
        return;
      }
      this.projectDoc = await this.projectService.get(projectId);
    } else {
      await this.projectService.onlineAddCurrentUser(project.projectId);
      this.router.navigate(['/projects', project.projectId]);
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
