import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { instance, mock, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { GlobalNoticesComponent } from './global-notices.component';

const mockedAuthService = mock(AuthService);
when(mockedAuthService.isLoggedIn).thenResolve(true);

const meta: Meta<GlobalNoticesComponent> = {
  title: 'Shared/Global Notices',
  component: GlobalNoticesComponent,
  decorators: [
    moduleMetadata({
      imports: [GlobalNoticesComponent],
      providers: [{ provide: AuthService, useValue: instance(mockedAuthService) }]
    })
  ]
};

export default meta;
type Story = StoryObj<GlobalNoticesComponent>;

export const Default: Story = {
  args: { hideNotice: false }
};
