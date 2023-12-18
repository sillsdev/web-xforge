import { Meta, StoryObj } from '@storybook/angular';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { AvatarComponent } from './avatar.component';

const meta: Meta<AvatarComponent> = {
  title: 'Utility/Avatar',
  component: AvatarComponent
};
export default meta;

type Story = StoryObj<AvatarComponent>;

export const Default: Story = {
  args: {
    user: createTestUserProfile()
  }
};

export const WithImage: Story = {
  args: {
    user: createTestUserProfile({
      avatarUrl: 'https://lh3.googleusercontent.com/a/AAcHTtcyQUN11i9S3aHfAPpIKzvsqjWOz3fKQnMfigwpklWc4q4=s96-c',
      displayName: 'John Doe'
    })
  }
};

export const WithInitials: Story = {
  args: {
    user: createTestUserProfile({
      displayName: 'John Doe',
      avatarUrl: ''
    })
  }
};

export const WithThreeNames: Story = {
  args: {
    user: createTestUserProfile({
      displayName: 'John Doe Junior',
      avatarUrl: ''
    })
  }
};

export const ChineseName: Story = {
  args: {
    user: createTestUserProfile({
      displayName: '李小龙',
      avatarUrl: ''
    })
  }
};

export const ArabicName: Story = {
  args: {
    user: createTestUserProfile({
      displayName: 'أسئلة',
      avatarUrl: ''
    })
  }
};
