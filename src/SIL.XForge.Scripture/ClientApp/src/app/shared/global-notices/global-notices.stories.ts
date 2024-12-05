import { Meta, StoryObj } from '@storybook/angular';
import { GlobalNoticesComponent } from './global-notices.component';

const meta: Meta<GlobalNoticesComponent> = {
  title: 'Shared/Global Notices',
  component: GlobalNoticesComponent
};

export default meta;
type Story = StoryObj<GlobalNoticesComponent>;

export const Default: Story = {
  args: { showDowntimeNotice: true }
};
