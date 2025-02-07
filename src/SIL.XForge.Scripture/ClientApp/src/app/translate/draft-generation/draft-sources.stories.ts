import { DestroyRef } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from '../../../xforge-common/activated-project.service';
import { DialogService } from '../../../xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from '../../../xforge-common/feature-flags/feature-flag.service';
import { SFUserProjectsService } from '../../../xforge-common/user-projects.service';
import { ParatextProject } from '../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../core/paratext.service';
import { SFProjectService } from '../../core/sf-project.service';
import { DraftSourcesComponent } from '../../translate/draft-generation/draft-sources/draft-sources.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockDestroyRef = mock(DestroyRef);
const mockParatextService = mock(ParatextService);
const mockDialogService = mock(DialogService);
const mockProjectService = mock(SFProjectService);
const mockUserProjectsService = mock(SFUserProjectsService);
const mockRouter = mock(Router);
const mockFeatureFlags = mock(FeatureFlagService);

interface DraftSourcesComponentStoryState {
  project: SFProjectProfileDoc;
  mixedSource: boolean;
}

const defaultArgs: DraftSourcesComponentStoryState = {
  project: { data: createTestProjectProfile() } as SFProjectProfileDoc,
  mixedSource: true
};

when(mockActivatedProjectService.changes$).thenReturn(of({ data: createTestProjectProfile() } as SFProjectProfileDoc));
when(mockFeatureFlags.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(true));

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
        { provide: FeatureFlagService, useValue: instance(mockFeatureFlags) }
      ]
    })
  ],
  // render: args => {
  //   // setUpMocks(args as DraftSourcesComponentStoryState);
  //   return {
  //     // moduleMetadata: {
  //     //   providers: [
  //     //     { provide: ActivatedProjectService, useValue: instance(mockActivatedProjectService) },
  //     //     { provide: DestroyRef, useValue: instance(mockDestroyRef) },
  //     //     { provide: ParatextService, useValue: instance(mockParatextService) },
  //     //     { provide: DialogService, useValue: instance(mockDialogService) },
  //     //     { provide: SFProjectService, useValue: instance(mockProjectService) },
  //     //     { provide: SFUserProjectsService, useValue: instance(mockUserProjectsService) },
  //     //     { provide: Router, useValue: instance(mockRouter) },
  //     //     { provide: FeatureFlagService, useValue: instance(mockFeatureFlags) }
  //     //   ]
  //     // },
  //     template: `<app-draft-sources></app-draft-sources>`
  //   };
  // },
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
