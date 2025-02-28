import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers, TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { DraftSourcesAsSelectableProjectArrays } from '../draft-utils';
import { LanguageCodesConfirmationComponent } from './language-codes-confirmation.component';

const mockAuthService = mock(AuthService);
const mockActivatedProject = mock(ActivatedProjectService);

const draftSources: DraftSourcesAsSelectableProjectArrays = {
  draftingSources: [
    {
      shortName: 'ADS',
      name: 'Alternate Drafting Source',
      paratextId: 'alternate-drafting-source',
      languageTag: 'es'
    }
  ],
  trainingSources: [
    {
      shortName: 'ALT-TS',
      name: 'Alternate Training Source',
      paratextId: 'alternate-training-source',
      languageTag: 'es'
    },
    {
      shortName: 'ADD-TS',
      name: 'Additional Training Source',
      paratextId: 'additional-training-source',
      languageTag: 'es'
    }
  ],
  trainingTargets: [
    {
      shortName: 'TP',
      name: 'Test Project',
      paratextId: 'test-proj-id',
      languageTag: 'eng'
    }
  ]
};

const defaultArgs = { draftSources };

when(mockActivatedProject.projectId).thenReturn('test-proj');
when(mockActivatedProject.projectDoc).thenReturn({
  id: 'test-proj',
  data: createTestProjectProfile({ userRoles: { user1: SFProjectRole.ParatextAdministrator } })
} as SFProjectProfileDoc);
when(mockAuthService.currentUserId).thenReturn('user1');

const meta: Meta = {
  title: 'Translate/LanguageCodesConfirmation',
  component: LanguageCodesConfirmationComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TranslocoModule, TranslocoMarkupComponent, LanguageCodesConfirmationComponent],
      providers: [
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProject) },
        { provide: AuthService, useValue: instance(mockAuthService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ]
};

export default meta;

interface StoryState {}

type Story = StoryObj<StoryState>;

export const Default: Story = {
  args: defaultArgs
};

export const SameSourceAndTargetCodes: Story = {
  args: {
    ...defaultArgs,
    targetLanguageTag: 'es'
  }
};

export const DifferentSourceCodes: Story = {
  args: {
    ...defaultArgs,
    draftingSources: [
      {
        shortName: 'ADS',
        name: 'Alternate Drafting Source',
        paratextId: 'alternate-drafting-source',
        languageTag: 'cat'
      } satisfies SelectableProjectWithLanguageCode
    ]
  }
};
