import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from '../language-codes-confirmation/language-codes-confirmation.component';
import { ConfirmSourcesComponent } from './confirm-sources.component';

const mockDraftService = mock(DraftSourcesService);
const mockActivatedProject = mock(ActivatedProjectService);
const mockAuthService = mock(AuthService);

when(mockDraftService.getDraftProjectSources()).thenReturn(
  of({
    draftingSources: [
      {
        projectRef: 'alternate-drafting-source',
        shortName: 'ADS',
        name: 'Alternate Drafting Source',
        paratextId: 'alternate-drafting-source',
        writingSystem: { tag: 'es' }
      } as DraftSource
    ],
    trainingSources: [
      {
        projectRef: 'alternate-training-source',
        shortName: 'ATS',
        name: 'Alternate Training Source',
        paratextId: 'alternate-training-source',
        writingSystem: { tag: 'es' }
      } as DraftSource,
      {
        projectRef: 'additional-training-source',
        shortName: 'ATS',
        name: 'Additional Training Source',
        paratextId: 'additional-training-source',
        writingSystem: { tag: 'es' }
      } as DraftSource
    ],
    trainingTargets: [
      {
        projectRef: 'test-proj',
        shortName: 'TP',
        name: 'Test Project',
        paratextId: 'test-proj-id',
        writingSystem: { tag: 'eng' }
      } as DraftSource
    ]
  } as DraftSourcesAsArrays)
);

when(mockActivatedProject.projectId).thenReturn('test-proj');
when(mockActivatedProject.projectDoc).thenReturn({
  id: 'test-proj',
  data: createTestProjectProfile({ userRoles: { user1: SFProjectRole.ParatextAdministrator } })
} as SFProjectProfileDoc);
when(mockAuthService.currentUserId).thenReturn('user1');

const meta: Meta = {
  title: 'Translate/ConfirmSources',
  component: ConfirmSourcesComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TranslocoModule, LanguageCodesConfirmationComponent],
      providers: [
        { provide: DraftSourcesService, useValue: instance(mockDraftService) },
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProject) },
        { provide: AuthService, useValue: instance(mockAuthService) }
      ]
    })
  ]
};

export default meta;

interface StoryState {}

type Story = StoryObj<StoryState>;

export const Default: Story = {
  args: {
    book: 1,
    progress: 0.37,
    hues: [0]
  }
};
