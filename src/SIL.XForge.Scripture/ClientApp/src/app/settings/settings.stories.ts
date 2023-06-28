import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { DialogService } from 'xforge-common/dialog.service';
import { PwaService } from 'xforge-common/pwa.service';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SharedModule } from '../shared/shared.module';
import { SettingsComponent } from './settings.component';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';

const mockedActivatedRoute = mock(ActivatedRoute);
when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project1' }));
const mockedNoticeService = mock(NoticeService);
const mockedParatextService = mock(ParatextService);
const mockedUserService = mock(UserService);
const mockedDialogService = mock(DialogService);
const mockedPwaService = mock(PwaService);

when(mockedParatextService.getProjects()).thenResolve([
  {
    paratextId: 'paratextId01',
    name: 'ParatextP1',
    shortName: 'PT1',
    languageTag: 'qaa',
    isConnectable: true,
    isConnected: false
  }
]);
when(mockedParatextService.getResources()).thenResolve([
  { paratextId: 'e01f11e9b4b8e338', name: 'Sob Jonah and Luke', shortName: 'SJL' },
  {
    paratextId: '5e51f89e89947acb',
    name: 'Aruamu New Testament [msy] Papua New Guinea 2004 DBL',
    shortName: 'ANT'
  },
  { paratextId: '9bb76cd3e5a7f9b4', name: 'Revised Version with Apocrypha 1885, 1895', shortName: 'RVA' }
]);

const mockedSFProjectService = mock(SFProjectService);
when(mockedSFProjectService.get(anything())).thenResolve({
  id: 'project01',
  data: {
    name: 'Project 01',
    paratextId: 'paratextId01',
    shortName: 'P01',
    writingSystem: {
      tag: 'qaa'
    },
    translateConfig: {
      translationSuggestionsEnabled: true
    },
    checkingConfig: {
      checkingEnabled: true,
      shareEnabled: true,
      usersSeeEachOthersResponses: true
    },
    sync: {
      queuedCount: 0,
      syncDisabled: false,
      lastSyncSuccessful: true,
      lastSyncTimestamp: new Date().toISOString()
    }
  } as any as SFProject
} as any as SFProjectDoc);
when(mockedSFProjectService.onlineIsSourceProject(anything())).thenResolve(false);

when(mockedPwaService.isOnline).thenReturn(true);
when(mockedPwaService.onlineStatus$).thenReturn(of(true));

const meta: Meta<SettingsComponent> = {
  title: 'Settings/Settings Component',
  component: SettingsComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, SharedModule, XForgeCommonModule, UICommonModule, I18nStoryModule],
      providers: [
        { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
        { provide: NoticeService, useValue: instance(mockedNoticeService) },
        { provide: ParatextService, useValue: instance(mockedParatextService) },
        // { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
        { provide: UserService, useValue: instance(mockedUserService) },
        { provide: DialogService, useValue: instance(mockedDialogService) },
        { provide: PwaService, useValue: instance(mockedPwaService) },
        { provide: SFProjectService, useValue: StubProjectService.withDefaultProject() }
      ]
    })
  ]
};
export default meta;
type Story = StoryObj<SettingsComponent>;
export const MyStory: Story = {};
