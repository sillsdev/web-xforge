import { CommonModule } from '@angular/common';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UserService } from 'xforge-common/user.service';
import { instance, mock, when, anything } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { MdcDialog, MdcDialogModule } from '@angular-mdc/web';
import { MatDialogModule } from '@angular/material/dialog';
import { UserProfileDoc } from '../../../../../xforge-common/models/user-profile-doc';
import { CheckingCommentsComponent } from './checking-comments.component';

const meta: Meta<CheckingCommentsComponent> = {
  title: 'Checking/Comments/Comments',
  component: CheckingCommentsComponent
};
export default meta;

const mockedDialogService = mock(DialogService);
const mockedUserService = mock(UserService);
when(mockedUserService.getProfile(anything())).thenResolve({
  id: 'user01',
  data: {
    displayName: 'Test User',
    avatarUrl: ''
  }
} as UserProfileDoc);
when(mockedUserService.currentUserId).thenReturn('user01');

const defaultArgs = {
  project: {
    paratextId: '',
    shortName: '',
    writingSystem: {
      tag: ''
    },
    translateConfig: {
      translationSuggestionsEnabled: false,
      shareEnabled: false
    },
    checkingConfig: {
      checkingEnabled: true,
      usersSeeEachOthersResponses: true,
      shareEnabled: true,
      answerExportMethod: CheckingAnswerExport.All
    },
    texts: [],
    sync: {
      queuedCount: 0
    },
    editable: true,
    name: '',
    userRoles: {
      user01: 'sf_community_checker'
    },
    userPermissions: {}
  },
  answer: {
    text: 'answer',
    comments: [
      {
        text: 'comment 1',
        dataId: '',
        deleted: false,
        dateModified: '',
        dateCreated: '',
        ownerRef: 'user01'
      }
    ],
    likes: [],
    dataId: '',
    deleted: false,
    dateModified: '',
    dateCreated: '',
    ownerRef: 'user01'
  }
};

type Story = StoryObj<CheckingCommentsComponent>;

const Template: Story = {
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule, MdcDialogModule, MatDialogModule],
      providers: [
        { provide: MdcDialog, useValue: {} },
        { provide: DialogService, useValue: instance(mockedDialogService) },
        { provide: UserService, useValue: instance(mockedUserService) }
      ],
      declarations: [OwnerComponent]
    })
  ]
};

export const NewForm: Story = { ...Template };
NewForm.args = defaultArgs;
