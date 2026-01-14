import { AfterViewInit, Component, DestroyRef, Input, OnChanges, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ParatextService } from '../../../core/paratext.service';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftImportWizardComponent } from './draft-import-wizard.component';

const mockDestroyRef = mock(DestroyRef);
const mockI18nService = mock(I18nService);
const mockMatDialogRef = mock(MatDialogRef<DraftImportWizardComponent, boolean>);
const mockParatextService = mock(ParatextService);
const mockProjectNotificationService = mock(ProjectNotificationService);
const mockProjectService = mock(SFProjectService);
const mockTextDocService = mock(TextDocService);
const mockActivatedProjectService = mock(ActivatedProjectService);
const mockOnlineStatusService = mock(OnlineStatusService);

@Component({
  selector: 'app-draft-import-wizard-wrapper',
  standalone: true,
  imports: [DraftImportWizardComponent],
  template: `<app-draft-import-wizard></app-draft-import-wizard>`
})
class DraftImportWizardWrapperComponent implements AfterViewInit, OnChanges {
  @ViewChild(DraftImportWizardComponent) component!: DraftImportWizardComponent;
  @Input() online: boolean = false;
  @Input() isLoadingProject: boolean = false;
  @Input() isLoadingProjects: boolean = false;
  @Input() noDraftsAvailable: boolean = false;
  @Input() projectLoadingFailed: boolean = false;
  @Input() bookCreationError?: string;
  @Input() step: number = 0;

  ngAfterViewInit(): void {
    this.updateComponent();
  }

  ngOnChanges(): void {
    this.updateComponent();
  }

  private updateComponent(): void {
    if (!this.component) return;
    setTimeout(() => {
      this.component.isLoadingProject = this.isLoadingProject;
      this.component.isLoadingProjects = this.isLoadingProjects;
      this.component.noDraftsAvailable = this.noDraftsAvailable;
      this.component.projectLoadingFailed = this.projectLoadingFailed;
      this.component.bookCreationError = this.bookCreationError;
      if (this.component.stepper && this.component.stepper.selectedIndex !== this.step) {
        this.component.stepper.selectedIndex = this.step;
      }
    });
  }
}

interface DraftImportWizardComponentState {
  online: boolean;
  step: number;
  isLoadingProject: boolean;
  isLoadingProjects: boolean;
  noDraftsAvailable: boolean;
  projectLoadingFailed: boolean;
  bookCreationError?: string;
}

const defaultArgs: DraftImportWizardComponentState = {
  online: true,
  step: 0,
  isLoadingProject: false,
  isLoadingProjects: false,
  noDraftsAvailable: false,
  projectLoadingFailed: false,
  bookCreationError: undefined
};

const buildDto: BuildDto = {
  additionalInfo: { dateFinished: '2026-01-14T15:16:17.18+00:00' }
} as BuildDto;

export default {
  title: 'Draft/Draft Import Wizard Dialog',
  component: DraftImportWizardComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: DestroyRef, useValue: instance(mockDestroyRef) },
        { provide: MAT_DIALOG_DATA, useValue: instance(buildDto) },
        { provide: I18nService, useValue: instance(mockI18nService) },
        { provide: MatDialogRef, useValue: instance(mockMatDialogRef) },
        { provide: ParatextService, useValue: instance(mockParatextService) },
        { provide: ProjectNotificationService, useValue: instance(mockProjectNotificationService) },
        { provide: SFProjectService, useValue: instance(mockProjectService) },
        { provide: TextDocService, useValue: instance(mockTextDocService) },
        { provide: OnlineStatusService, useValue: instance(mockOnlineStatusService) },
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProjectService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ],
  render: args => {
    setUpMocks(args);
    return {
      component: DraftImportWizardWrapperComponent,
      props: args
    };
  },
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
    }
  },
  argTypes: {
    online: { control: 'boolean' },
    isLoadingProject: { control: 'boolean' },
    isLoadingProjects: { control: 'boolean' },
    noDraftsAvailable: { control: 'boolean' },
    projectLoadingFailed: { control: 'boolean' },
    bookCreationError: { control: 'text' },
    step: { control: 'number' }
  }
} as Meta<DraftImportWizardComponentState>;

type Story = StoryObj<DraftImportWizardComponentState>;

const Template: Story = {};

export const StepOne: Story = {
  ...Template
};

function setUpMocks(args: DraftImportWizardComponentState): void {
  when(mockOnlineStatusService.onlineStatus$).thenReturn(of(args.online));
  when(mockOnlineStatusService.isOnline).thenReturn(args.online);
  when(mockOnlineStatusService.online).thenReturn(
    new Promise(resolve => {
      if (args.online) resolve();
      // Else, never resolve.
    })
  );
  when(mockI18nService.forwardDirectionWord).thenReturn('right');
  when(mockI18nService.backwardDirectionWord).thenReturn('left');
}
