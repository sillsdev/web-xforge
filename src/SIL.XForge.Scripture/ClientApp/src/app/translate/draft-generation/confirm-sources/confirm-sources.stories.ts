import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
// import { I18nStoryModule } from '../../../../xforge-common/i18n-story.module';
// import { UICommonModule } from '../../../../xforge-common/ui-common.module';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ConfirmSourcesComponent } from './confirm-sources.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);

when(mockedActivatedProjectService.projectDoc).thenReturn({
  data: createTestProjectProfile({
    name: 'Test Project',
    translateConfig: {
      source: {
        projectRef: 'source-project',
        shortName: 'SP',
        name: 'THIS PROJECT SHOULD NOT BE SHOWN!!!!!****',
        paratextId: 'source-project',
        writingSystem: { tag: 'es' }
      },
      draftConfig: {
        alternateTrainingSourceEnabled: true,
        alternateTrainingSource: {
          projectRef: 'alternate-training-source',
          shortName: 'ATS',
          name: 'Alternate Training Source',
          paratextId: 'alternate-training-source',
          writingSystem: { tag: 'es' }
        },
        additionalTrainingSourceEnabled: true,
        additionalTrainingSource: {
          projectRef: 'additional-training-source',
          shortName: 'ATS',
          name: 'Additional Training Source',
          paratextId: 'additional-training-source',
          writingSystem: { tag: 'es' }
        },
        alternateSourceEnabled: true,
        alternateSource: {
          projectRef: 'alternate-drafting-source',
          shortName: 'ADS',
          name: 'Alternate Drafting Source',
          paratextId: 'alternate-drafting-source',
          writingSystem: { tag: 'es' }
        }
      }
    }
  })
} as SFProjectProfileDoc);

const meta: Meta = {
  title: 'Translate/ConfirmSources',
  component: ConfirmSourcesComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TranslocoModule],
      providers: [{ provide: ActivatedProjectService, useValue: instance(mockedActivatedProjectService) }]
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
