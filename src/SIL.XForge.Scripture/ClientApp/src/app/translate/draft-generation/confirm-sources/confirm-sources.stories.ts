import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSourcesService } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from '../language-codes-confirmation/language-codes-confirmation.component';
import { ConfirmSourcesComponent } from './confirm-sources.component';

const mockDraftService = mock(DraftSourcesService);
const mockActivatedProject = mock(ActivatedProjectService);
const mockProjectService = mock(SFProjectService);
const mockAuthService = mock(AuthService);

const alternateTrainingSource: TranslateSource = {
  projectRef: 'alternate-training-source',
  shortName: 'ALT-TS',
  name: 'Alternate Training Source',
  paratextId: 'alternate-training-source',
  writingSystem: { tag: 'es' }
};
const additionalTrainingSource: TranslateSource = {
  projectRef: 'additional-training-source',
  shortName: 'ADD-TS',
  name: 'Additional Training Source',
  paratextId: 'additional-training-source',
  writingSystem: { tag: 'es' }
};
const alternateSource: TranslateSource = {
  projectRef: 'alternate-drafting-source',
  shortName: 'ADS',
  name: 'Alternate Drafting Source',
  paratextId: 'alternate-drafting-source',
  writingSystem: { tag: 'es' }
};

const testProject = createTestProjectProfile({
  name: 'Test Project',
  translateConfig: {
    source: {
      projectRef: 'source-project',
      shortName: 'SP',
      name: 'THIS PROJECT SHOULD NOT BE SHOWN!!!!!****',
      paratextId: 'source-project'
    },
    draftConfig: {
      alternateTrainingSourceEnabled: true,
      alternateTrainingSource,
      additionalTrainingSourceEnabled: true,
      additionalTrainingSource,
      alternateSourceEnabled: true,
      alternateSource
    }
  }
});
when(mockActivatedProject.projectDoc$).thenReturn(of({ id: 'test-proj', data: testProject } as SFProjectProfileDoc));

when(mockActivatedProject.projectId).thenReturn('test-proj');
when(mockActivatedProject.projectDoc).thenReturn({
  id: 'test-proj',
  data: createTestProjectProfile({ userRoles: { user1: SFProjectRole.ParatextAdministrator } })
} as SFProjectProfileDoc);
when(mockProjectService.onlineGetDraftSources('test-proj')).thenResolve({
  draftingSources: [alternateSource],
  trainingSources: [alternateTrainingSource, additionalTrainingSource],
  trainingTargets: [testProject]
});
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
        { provide: SFProjectService, useValue: instance(mockProjectService) },
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
