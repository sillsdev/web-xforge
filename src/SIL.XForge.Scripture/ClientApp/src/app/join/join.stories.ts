import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/test';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { GenericDialogComponent } from 'xforge-common/generic-dialog/generic-dialog.component';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectService } from '../core/sf-project.service';
import { NoticeComponent } from '../shared/notice/notice.component';
import { JoinComponent } from './join.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAnonymousService = mock(AnonymousService);
const mockedAuthService = mock(AuthService);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedOnlineStatusService = mock(OnlineStatusService);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);

enum ShareKeys {
  Expired = 'expired',
  InvalidRole = 'invalid_role',
  InvalidShareKey = 'invalid_share_key',
  KeyAlreadyUsed = 'key_already_used',
  MaxUsersReached = 'max_users_reached',
  Valid = 'valid'
}

// Additional states of the app to support mocks
interface StoryAppState {
  online: boolean;
  loggedIn: boolean;
  shareKey: string;
}

const defaultArgs: StoryAppState = {
  online: true,
  loggedIn: false,
  shareKey: ShareKeys.Valid
};

const meta: Meta = {
  title: 'App/Join with share key',
  component: JoinComponent,
  argTypes: {
    online: {
      description: 'Is application online',
      table: { category: 'App state' }
    },
    loggedIn: {
      description: 'Is user logged in',
      table: { category: 'App state' }
    },
    shareKey: {
      options: Object.values(ShareKeys),
      control: 'select',
      table: { category: 'App state' }
    }
  },
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule, NoticeComponent],
      declarations: [GenericDialogComponent],
      providers: [
        { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
        {
          provide: AnonymousService,
          useValue: instance(mockedAnonymousService)
        },
        { provide: AuthService, useValue: instance(mockedAuthService) },
        { provide: DialogService },
        { provide: LocationService, useValue: instance(mockedLocationService) },
        { provide: NoticeService, useValue: instance(mockedNoticeService) },
        {
          provide: OnlineStatusService,
          useValue: instance(mockedOnlineStatusService)
        },
        { provide: Router, useValue: instance(mockedRouter) },
        {
          provide: SFProjectService,
          useValue: instance(mockedSFProjectService)
        }
      ]
    }),
    (story, context) => {
      when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(context.args.online));
      when(mockedOnlineStatusService.isOnline).thenReturn(context.args.online);
      when(mockedAuthService.isLoggedIn).thenResolve(context.args.loggedIn);
      when(mockedActivatedRoute.params).thenReturn(of({ shareKey: context.args.shareKey, locale: 'en' }));
      when(mockedAnonymousService.checkShareKey(context.args.shareKey)).thenResolve({
        shareKey: context.args.shareKey,
        projectName: 'Storybook Project',
        role: ''
      });
      when(mockedAnonymousService.generateAccount(ShareKeys.MaxUsersReached, anything(), anything())).thenThrow(
        new HttpErrorResponse({ error: 'max_users_reached' })
      );
      when(mockedAnonymousService.generateAccount(ShareKeys.Expired, anything(), anything())).thenThrow(
        new HttpErrorResponse({ error: 'key_expired' })
      );
      when(mockedAnonymousService.generateAccount(ShareKeys.InvalidRole, anything(), anything())).thenThrow(
        new HttpErrorResponse({ error: 'role_not_found' })
      );
      when(mockedSFProjectService.onlineJoinWithShareKey(ShareKeys.KeyAlreadyUsed)).thenThrow(
        new CommandError(CommandErrorCode.Forbidden, 'key_already_used')
      );
      when(mockedSFProjectService.onlineJoinWithShareKey(ShareKeys.InvalidShareKey)).thenThrow(
        new CommandError(CommandErrorCode.Forbidden, 'project_link_is_invalid')
      );
      if (context.args.shareKey === ShareKeys.Valid) {
        when(mockedAuthService.tryTransparentAuthentication()).thenCall(() => {
          when(mockedAuthService.isLoggedIn).thenResolve(true);
          when(mockedSFProjectService.onlineJoinWithShareKey(ShareKeys.Valid)).thenReturn(new Promise(r => r));
        });
      }
      return story();
    }
  ],
  parameters: {
    controls: {
      expanded: true,
      include: Object.keys(defaultArgs)
    }
  },
  args: defaultArgs
};

export default meta;

type Story = StoryObj<StoryAppState>;

export const EnterYourName: Story = {};

export const OfflineNoticeWhenJoining: Story = {
  args: { online: false }
};

export const JoiningWithValidKey: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const joinButton: HTMLElement = canvas.getByRole('button');
    const nameInput: HTMLElement = canvas.getByRole('textbox');
    await userEvent.type(nameInput, 'Anonymous');
    await userEvent.click(joinButton);
  }
};

export const DialogExpiredKey: Story = {
  ...JoiningWithValidKey,
  args: { shareKey: ShareKeys.Expired }
};

export const DialogInvalidRole: Story = {
  ...JoiningWithValidKey,
  args: { shareKey: ShareKeys.InvalidRole }
};

export const DialogMaxUsersReached: Story = {
  ...JoiningWithValidKey,
  args: { shareKey: ShareKeys.MaxUsersReached }
};

export const DialogInvalidShareKey: Story = {
  args: {
    shareKey: ShareKeys.InvalidShareKey,
    loggedIn: true
  }
};

export const DialogKeyAlreadyUsed: Story = {
  args: {
    shareKey: ShareKeys.KeyAlreadyUsed,
    loggedIn: true
  }
};
