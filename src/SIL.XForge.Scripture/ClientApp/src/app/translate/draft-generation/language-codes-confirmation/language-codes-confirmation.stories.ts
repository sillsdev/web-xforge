import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers, TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { expect, within } from 'storybook/test';
import { instance, mock } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DraftSourcesAsSelectableProjectArrays } from '../draft-utils';
import { LanguageCodesConfirmationComponent } from './language-codes-confirmation.component';

const mockAuthService = mock(AuthService);
const mockActivatedProject = mock(ActivatedProjectService);

const defaultDraftSources: DraftSourcesAsSelectableProjectArrays = {
  draftingSources: [
    {
      shortName: 'FDS',
      name: 'First Drafting Source',
      paratextId: 'first-drafting-source',
      languageTag: 'es'
    }
  ],
  trainingSources: [
    {
      shortName: 'FTS',
      name: 'First Training Source',
      paratextId: 'first-training-source',
      languageTag: 'spa'
    },
    {
      shortName: 'STS',
      name: 'Second Training Source',
      paratextId: 'second-training-source',
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

const meta: Meta = {
  title: 'Translate/LanguageCodesConfirmation',
  component: LanguageCodesConfirmationComponent,
  decorators: [
    moduleMetadata({
      imports: [TranslocoModule, TranslocoMarkupComponent, LanguageCodesConfirmationComponent],
      providers: [
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProject) },
        { provide: AuthService, useValue: instance(mockAuthService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ],
  render: args => {
    return {
      props: args,
      template: '<app-language-codes-confirmation [sources]="draftSources"></app-language-codes-confirmation>'
    };
  }
};

export default meta;

interface StoryState {}

type Story = StoryObj<StoryState>;

export const Default: Story = {
  args: { defaultDraftSources },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('heading', { name: 'Incorrect language codes will dramatically reduce draft quality.' });
    expect(canvas.queryByRole('checkbox')).toBeTruthy();
  }
};

export const SameSourceAndTargetCodes: Story = {
  args: {
    draftSources: {
      draftingSources: defaultDraftSources.draftingSources,
      trainingSources: defaultDraftSources.trainingSources,
      trainingTargets: [
        {
          ...defaultDraftSources.trainingTargets[0],
          languageTag: 'es'
        }
      ]
    } satisfies DraftSourcesAsSelectableProjectArrays
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('heading', { name: 'Source and target languages are both Spanish' });
    expect(canvas.queryByRole('checkbox')).toBeTruthy();
  }
};

export const DifferentSourceCodes: Story = {
  args: {
    draftSources: {
      draftingSources: defaultDraftSources.draftingSources,
      trainingSources: [
        defaultDraftSources.trainingSources[0],
        {
          ...defaultDraftSources.trainingSources[1],
          languageTag: 'fr'
        }
      ],
      trainingTargets: defaultDraftSources.trainingTargets
    } satisfies DraftSourcesAsSelectableProjectArrays
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('heading', { name: 'All source and reference projects must be in the same language' });
    expect(canvas.queryByRole('checkbox')).toBeNull();
  }
};
