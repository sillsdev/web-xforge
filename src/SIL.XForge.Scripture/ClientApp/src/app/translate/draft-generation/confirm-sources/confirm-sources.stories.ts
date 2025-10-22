import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftSourcesService } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from '../language-codes-confirmation/language-codes-confirmation.component';
import { TrainingDataService } from '../training-data/training-data.service';
import { ConfirmSourcesComponent } from './confirm-sources.component';

const mockDraftService = mock(DraftSourcesService);
const mockActivatedProject = mock(ActivatedProjectService);
const mockAuthService = mock(AuthService);
const mockTrainingService = mock(TrainingDataService);

when(mockActivatedProject.changes$).thenReturn(
  of({
    data: createTestProjectProfile({
      name: 'Test Project',
      translateConfig: {
        source: {
          projectRef: 'source-project',
          shortName: 'SP',
          name: 'THIS PROJECT SHOULD NOT BE SHOWN!!!!!****',
          paratextId: 'source-project'
        },
        draftConfig: {
          draftingSources: [
            {
              projectRef: 'first-drafting-source',
              shortName: 'FDS',
              name: 'First Drafting Source',
              paratextId: 'first-drafting-source',
              writingSystem: { tag: 'es' }
            }
          ],
          trainingSources: [
            {
              projectRef: 'first-training-source',
              shortName: 'FTS',
              name: 'First Training Source',
              paratextId: 'first-training-source',
              writingSystem: { tag: 'es' }
            },
            {
              projectRef: 'second-training-source',
              shortName: 'STS',
              name: 'Second Training Source',
              paratextId: 'second-training-source',
              writingSystem: { tag: 'es' }
            }
          ]
        }
      }
    })
  } as SFProjectProfileDoc)
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
      imports: [TranslocoModule, LanguageCodesConfirmationComponent],
      providers: [
        { provide: DraftSourcesService, useValue: instance(mockDraftService) },
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProject) },
        { provide: AuthService, useValue: instance(mockAuthService) },
        { provide: TrainingDataService, useValue: instance(mockTrainingService) }
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
