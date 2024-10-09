import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, within } from '@storybook/test';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { instance, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { CheckingCommentFormComponent } from './checking-comment-form/checking-comment-form.component';
import { CheckingCommentsComponent } from './checking-comments.component';

const mockedDialogService = mock(DialogService);
const mockedUserService = mock(UserService);
when(mockedUserService.currentUserId).thenReturn('user01');
when(mockedUserService.getProfile('user01')).thenResolve({
  id: 'user01',
  data: createTestUserProfile({}, 1)
} as UserProfileDoc);
when(mockedUserService.getProfile('user02')).thenResolve({
  id: 'user02',
  data: createTestUserProfile({}, 2)
} as UserProfileDoc);

const defaultArgs = {
  project: createTestProject({
    userRoles: {
      user01: 'sf_community_checker'
    }
  }),
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

const meta: Meta<CheckingCommentsComponent> = {
  title: 'Checking/Comments/Comments',
  component: CheckingCommentsComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule],
      providers: [
        { provide: DialogService, useValue: instance(mockedDialogService) },
        { provide: UserService, useValue: instance(mockedUserService) }
      ],
      declarations: [OwnerComponent, CheckingCommentFormComponent]
    })
  ],
  args: defaultArgs
};
export default meta;

type Story = StoryObj<CheckingCommentsComponent>;

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

function createComments(userIds: string[]): Comment[] {
  return userIds.map((id, index) => createComment(`comment ${index + 1}`, id));
}

export const NoComments: Story = {};

export const OwnComments: Story = {
  args: {
    answer: {
      ...defaultArgs.answer,
      comments: createComments(['user01', 'user01', 'user01'])
    }
  },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);

    const editButtons = root.getAllByTestId('comment-edit');
    expect(editButtons.length).toBe(3);

    const deleteButtons = root.getAllByTestId('comment-delete');
    expect(deleteButtons.length).toBe(3);
  }
};

export const OthersComments: Story = {
  args: {
    answer: {
      ...defaultArgs.answer,
      comments: createComments(['user02', 'user02'])
    }
  },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);

    const editButtons = root.queryAllByTestId('comment-edit');
    expect(editButtons.length).toBe(0);

    const deleteButtons = root.queryAllByTestId('comment-delete');
    expect(deleteButtons.length).toBe(0);
  }
};

export const Admin: Story = {
  args: {
    project: {
      ...defaultArgs.project,
      userRoles: {
        user01: 'pt_administrator'
      }
    },
    answer: {
      ...defaultArgs.answer,
      comments: createComments(['user03', 'user02', 'user01'])
    }
  },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);

    const editButtons = root.getAllByTestId('comment-edit');
    expect(editButtons.length).toBe(1);

    const deleteButtons = root.getAllByTestId('comment-delete');
    expect(deleteButtons.length).toBe(3);
  }
};
