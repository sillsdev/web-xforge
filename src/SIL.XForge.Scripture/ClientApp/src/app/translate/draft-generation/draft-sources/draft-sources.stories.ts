import { DestroyRef } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSourcesComponent } from '../../../translate/draft-generation/draft-sources/draft-sources.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockDestroyRef = mock(DestroyRef);
const mockParatextService = mock(ParatextService);
const mockProjectService = mock(SFProjectService);
const mockUserProjectsService = mock(SFUserProjectsService);
const mockRouter = mock(Router);
const mockFeatureFlags = mock(FeatureFlagService);
const mockAuthService = mock(AuthService);

interface DraftSourcesComponentStoryState {
  project: SFProjectProfileDoc;
  mixedSource: boolean;
}

const defaultArgs: DraftSourcesComponentStoryState = {
  project: { data: createTestProjectProfile() } as SFProjectProfileDoc,
  mixedSource: true
};

const testProjectDoc = {
  data: createTestProjectProfile({
    translateConfig: {
      translationSuggestionsEnabled: false,
      preTranslate: true,
      draftConfig: {
        additionalTrainingSourceEnabled: true,
        alternateSourceEnabled: true,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSource: {
          paratextId: 'pt1',
          projectRef: 'sf1',
          name: 'Alternate Training Source',
          shortName: 'ATS',
          writingSystem: { script: 'Latn', tag: 'es' }
        },
        additionalTrainingSource: {
          paratextId: 'pt2',
          projectRef: 'sf2',
          name: 'Additional Training Source',
          shortName: 'ATS',
          writingSystem: { script: 'Latn', tag: 'es' }
        },
        alternateSource: {
          paratextId: 'pt3',
          projectRef: 'sf3',
          name: 'Alternate Source',
          shortName: 'AS',
          writingSystem: { script: 'Latn', tag: 'es' }
        }
      },
      // projectType: 'Standard',
      source: {
        paratextId: 'pt0',
        projectRef: 'sf0',
        name: 'Source',
        shortName: 'SOURCE',
        writingSystem: { script: 'Latn', tag: 'es' }
      }
    }
  })
} as SFProjectProfileDoc;

when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
when(mockActivatedProjectService.projectDoc).thenReturn(testProjectDoc);
when(mockFeatureFlags.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(true));
when(mockAuthService.currentUserId).thenReturn('user1');

const languageCodes = ['en', 'fr', 'es', 'pt', 'de', 'ru', 'zh', 'ar', 'hi', 'bn'];

function languageName(code: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
}

const resources: SelectableProjectWithLanguageCode[] = new Array(10).fill(0).map((_, i) => ({
  paratextId: `resource-${i}`,
  name: `${languageName(languageCodes[i])} Resource`,
  shortName: `R_${languageCodes[i].toUpperCase()}`,
  languageTag: languageCodes[i]
}));

const projects: ParatextProject[] = new Array(10).fill(0).map((_, i) => ({
  paratextId: `project-${i}`,
  name: `${languageName(languageCodes[i])} Project`,
  shortName: `P_${languageCodes[i].toUpperCase()}`,
  languageTag: languageCodes[i],
  projectId: `project-${i}`,
  isConnectable: true,
  isConnected: true
}));

when(mockParatextService.getResources()).thenResolve(resources);
when(mockParatextService.getProjects()).thenResolve(projects);

export default {
  title: 'Draft/DraftSources',
  component: DraftSourcesComponent,
  decorators: [
    moduleMetadata({
      imports: [MatDialogModule],
      providers: [
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProjectService) },
        { provide: DestroyRef, useValue: instance(mockDestroyRef) },
        { provide: ParatextService, useValue: instance(mockParatextService) },
        { provide: DialogService, useClass: DialogService },
        { provide: SFProjectService, useValue: instance(mockProjectService) },
        { provide: SFUserProjectsService, useValue: instance(mockUserProjectsService) },
        { provide: Router, useValue: instance(mockRouter) },
        { provide: FeatureFlagService, useValue: instance(mockFeatureFlags) },
        { provide: AuthService, useValue: instance(mockAuthService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ],
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
    }
  },
  argTypes: {}
} as Meta<DraftSourcesComponentStoryState>;

type Story = StoryObj<DraftSourcesComponentStoryState>;

const Template: Story = {
  render: args => ({
    props: args
  })
};

export const Default: Story = {
  ...Template,
  args: {}
};
