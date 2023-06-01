import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MdcDialog, MdcDialogModule } from '@angular-mdc/web';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { DialogService } from 'xforge-common/dialog.service';
import { instance, mock } from 'ts-mockito';
import { UserService } from 'xforge-common/user.service';
import { CheckingCommentsComponent } from './checking-comments.component';

const meta: Meta<CheckingCommentsComponent> = {
  title: 'Checking/Comments/Comments',
  component: CheckingCommentsComponent
};
export default meta;

const mockedDialogService = mock(DialogService);
const mockedUserService = mock(UserService);

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
    userRoles: {},
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
        ownerRef: ''
      }
    ],
    likes: [],
    dataId: '',
    deleted: false,
    dateModified: '',
    dateCreated: '',
    ownerRef: ''
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
      ]
    })
  ]
};

export const NewForm: Story = { ...Template };
NewForm.args = defaultArgs;
