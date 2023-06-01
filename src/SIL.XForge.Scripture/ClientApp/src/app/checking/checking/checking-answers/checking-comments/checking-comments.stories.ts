import { CommonModule } from '@angular/common';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UserService } from 'xforge-common/user.service';
import { instance, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { within } from '@storybook/testing-library';
import { expect } from '@storybook/jest';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { UserProfileDoc } from '../../../../../xforge-common/models/user-profile-doc';
import { CheckingCommentsComponent } from './checking-comments.component';

const meta: Meta<CheckingCommentsComponent> = {
  title: 'Checking/Comments/Comments',
  component: CheckingCommentsComponent
};
export default meta;

const mockedDialogService = mock(DialogService);
const mockedUserService = mock(UserService);
when(mockedUserService.currentUserId).thenReturn('user01');
when(mockedUserService.getProfile('user01')).thenResolve({
  id: 'user01',
  data: {
    displayName: 'Test User',
    avatarUrl: ''
  }
} as UserProfileDoc);
when(mockedUserService.getProfile('user02')).thenResolve({
  id: 'user02',
  data: {
    displayName: 'Other User',
    avatarUrl: ''
  }
} as UserProfileDoc);

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
    comments: [],
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
      imports: [CommonModule, UICommonModule, I18nStoryModule],
      providers: [
        { provide: DialogService, useValue: instance(mockedDialogService) },
        { provide: UserService, useValue: instance(mockedUserService) }
      ],
      declarations: [OwnerComponent]
    })
  ]
};

function createComment(content: string, owner: string): Comment {
  return {
    text: content,
    dataId: '',
    deleted: false,
    dateModified: '',
    dateCreated: '',
    ownerRef: owner
  };
}

export const NoComments: Story = { ...Template };
NoComments.args = defaultArgs;

export const OwnComments: Story = { ...Template };
OwnComments.args = {
  ...defaultArgs,
  answer: {
    ...defaultArgs.answer,
    comments: [
      createComment('comment 1', 'user01'),
      createComment('comment 2', 'user01'),
      createComment('comment 3', 'user01')
    ]
  }
};
OwnComments.play = async ({ canvasElement }) => {
  const root = within(canvasElement);

  const editButtons = root.getAllByRole('button', { name: /Edit/i });
  expect(editButtons.length).toBe(3);

  const deleteButtons = root.getAllByRole('button', { name: /Delete/i });
  expect(deleteButtons.length).toBe(3);
};

export const OthersComments: Story = { ...Template };
OthersComments.args = {
  ...defaultArgs,
  answer: {
    ...defaultArgs.answer,
    comments: [createComment('comment 1', 'user02'), createComment('comment 2', 'user02')]
  }
};
OthersComments.play = async ({ canvasElement }) => {
  const root = within(canvasElement);

  const editButtons = root.queryAllByRole('button', { name: /Edit/i });
  expect(editButtons.length).toBe(0);

  const deleteButtons = root.queryAllByRole('button', { name: /Delete/i });
  expect(deleteButtons.length).toBe(0);
};

export const Admin: Story = { ...Template };
Admin.args = {
  ...defaultArgs,
  project: {
    ...defaultArgs.project,
    userRoles: {
      user01: 'pt_administrator'
    }
  },
  answer: {
    ...defaultArgs.answer,
    comments: [
      createComment('comment 1', 'user3'),
      createComment('comment 2', 'user02'),
      createComment('comment 3', 'user01')
    ]
  }
};
Admin.play = async ({ canvasElement }) => {
  const root = within(canvasElement);

  const editButtons = root.getAllByRole('button', { name: /Edit/i });
  expect(editButtons.length).toBe(1);

  const deleteButtons = root.getAllByRole('button', { name: /Delete/i });
  expect(deleteButtons.length).toBe(3);
};
