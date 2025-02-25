import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers, TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DraftSource, DraftSourcesAsArrays } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from './language-codes-confirmation.component';

const mockAuthService = mock(AuthService);
const mockActivatedProject = mock(ActivatedProjectService);

const draftSources: DraftSourcesAsArrays = {
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
};

const defaultArgs = { draftSources };

when(mockActivatedProject.projectId).thenReturn('test-proj');
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
        projectRef: 'alternate-drafting-source',
        shortName: 'ADS',
        name: 'Alternate Drafting Source',
        paratextId: 'alternate-drafting-source',
        writingSystem: { tag: 'cat' }
      } as DraftSource
    ]
  }
};
