import { AsyncPipe, CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { PwaService } from 'xforge-common/pwa.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { LocationService } from 'xforge-common/location.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { GenericDialogComponent } from 'xforge-common/generic-dialog/generic-dialog.component';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { SFProjectService } from '../core/sf-project.service';
import { NoticeComponent } from '../shared/notice/notice.component';
import { JoinComponent } from './join.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAnonymousService = mock(AnonymousService);
const mockedAuthService = mock(AuthService);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
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

const meta: Meta = {
  title: 'App/Join with share key',
  component: JoinComponent,
  argTypes: {
    online: {
      name: 'Is app online',
      control: 'boolean',
      table: {
        category: 'App state'
      }
    },
    loggedIn: {
      name: 'Is user logged in',
      control: 'boolean',
      table: {
        category: 'App state'
      }
    },
    shareKey: {
      options: [
        ShareKeys.Expired,
        ShareKeys.InvalidRole,
        ShareKeys.InvalidShareKey,
        ShareKeys.MaxUsersReached,
        ShareKeys.KeyAlreadyUsed,
        ShareKeys.Valid
      ],
      control: 'select',
      table: {
        category: 'App state'
      }
    }
  }
};

export default meta;

// Additional states off the app to support mocks
interface StoryAppState {
  online: boolean;
  loggedIn: boolean;
  shareKey: string;
}

type Story = StoryObj<StoryAppState & JoinComponent>;

const Template: Story = {
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [NoticeComponent, GenericDialogComponent],
      providers: [
        { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
        { provide: AnonymousService, useValue: instance(mockedAnonymousService) },
        { provide: AuthService, useValue: instance(mockedAuthService) },
        { provide: DialogService },
        { provide: LocationService, useValue: instance(mockedLocationService) },
        { provide: NoticeService, useValue: instance(mockedNoticeService) },
        { provide: PwaService, useValue: instance(mockedPwaService) },
        { provide: Router, useValue: instance(mockedRouter) },
        { provide: MatDialogRef, useValue: {} },
        { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
        AsyncPipe
      ]
    }),
    (story, context) => {
      when(mockedPwaService.onlineStatus$).thenReturn(of(context.args.online));
      when(mockedPwaService.isOnline).thenReturn(context.args.online);
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
      exclude: [
        '_isLoading',
        'checkShareKey',
        'dispose',
        'informInvalidShareLinkAndRedirect',
        'joiningResponse',
        'joinProject',
        'joinWithShareKey',
        'loadingFinished',
        'loadingStarted',
        'logIn',
        'name',
        'ngOnDestroy',
        'ngUnsubscribe',
        'status',
        'subscribe',
        'updateOfflineJoiningStatus'
      ]
    }
  }
};

const Default: Story = {
  ...Template,
  args: {
    loggedIn: false,
    online: true,
    shareKey: ShareKeys.Valid
  }
};

export const DialogExpiredKey: Story = {
  ...Default,
  args: { ...Default.args, ...{ shareKey: ShareKeys.Expired } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const joinButton = canvas.getByRole('button');
    const nameInput = canvas.getByRole('textbox');
    await userEvent.type(nameInput, 'Anonymous');
    await userEvent.click(joinButton);
  }
};

export const DialogInvalidRole: Story = {
  ...Default,
  args: { ...Default.args, ...{ shareKey: ShareKeys.InvalidRole } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const joinButton = canvas.getByRole('button');
    const nameInput = canvas.getByRole('textbox');
    await userEvent.type(nameInput, 'Anonymous');
    await userEvent.click(joinButton);
  }
};

export const DialogInvalidShareKey: Story = {
  ...Default,
  args: { ...Default.args, ...{ shareKey: ShareKeys.InvalidShareKey, loggedIn: true } }
};

export const DialogKeyAlreadyUsed: Story = {
  ...Default,
  args: { ...Default.args, ...{ shareKey: ShareKeys.KeyAlreadyUsed, loggedIn: true } }
};

export const DialogMaxUsersReached: Story = {
  ...Default,
  args: { ...Default.args, ...{ shareKey: ShareKeys.MaxUsersReached } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const joinButton = canvas.getByRole('button');
    const nameInput = canvas.getByRole('textbox');
    await userEvent.type(nameInput, 'Anonymous');
    await userEvent.click(joinButton);
  }
};

export const EnterYourName: Story = {
  ...Default
};

export const JoiningWithValidKey: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const joinButton = canvas.getByRole('button');
    const nameInput = canvas.getByRole('textbox');
    await userEvent.type(nameInput, 'Anonymous');
    await userEvent.click(joinButton);
  }
};

export const OfflineNoticeWhenJoining: Story = {
  ...Default,
  args: { ...Default.args, ...{ online: false } }
};
