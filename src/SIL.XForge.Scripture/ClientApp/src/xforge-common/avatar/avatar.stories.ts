import { Meta, StoryObj } from '@storybook/angular';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { CALVIN_AVATAR_URI } from '../../data-uris';
import { AvatarComponent } from './avatar.component';

export default {
  title: 'Utility/Avatar',
  component: AvatarComponent,
  parameters: {
    controls: {
      include: ['user', 'size', 'borderColor']
    }
  },
  args: {
    size: 32
  }
} as Meta<AvatarComponent>;

type Story = StoryObj<AvatarComponent>;

export const WithImage: Story = {
  args: {
    user: createTestUserProfile({
      displayName: 'John Doe',
      avatarUrl: CALVIN_AVATAR_URI
    })
  }
};

export const WithFailedImage: Story = {
  args: {
    user: createTestUserProfile({
      displayName: 'John Doe',
      avatarUrl: 'https://example.com/non-existent.png'
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

export const WithVariedSizes: Story = {
  parameters: {
    controls: {
      include: []
    }
  },
  render: () => ({
    props: {
      borderColor: 'blue',
      user1: createTestUserProfile({
        displayName: 'John Doe',
        avatarUrl: ''
      }),
      user2: createTestUserProfile({
        displayName: 'John Doe',
        avatarUrl: CALVIN_AVATAR_URI
      }),
      user3: createTestUserProfile({
        displayName: '李小龙',
        avatarUrl: 'https://example.com/non-existent.png'
      })
    },
    template: `
      <style>
        .set {
          display: grid;
          justify-content: start;
          grid-template-columns: repeat(3, auto);
          gap: 4px;
          margin-bottom: 40px;
        }
      </style>

      ${[24, 32, 40, 64, 96]
        .map(
          size => `
        <h2>${size}px</h2>
        <div class="set">
          <app-avatar [user]="user1" [size]="${size}"></app-avatar>
          <app-avatar [user]="user2" [size]="${size}"></app-avatar>
          <app-avatar [user]="user3" [size]="${size}"></app-avatar>
          <app-avatar [user]="user1" [size]="${size}" [borderColor]="borderColor"></app-avatar>
          <app-avatar [user]="user2" [size]="${size}" [borderColor]="borderColor"></app-avatar>
          <app-avatar [user]="user3" [size]="${size}" [borderColor]="borderColor"></app-avatar>
        </div>
      `
        )
        .join('')}
    `
  })
};

export const WithBorder: Story = {
  args: {
    user: createTestUserProfile({
      displayName: 'John Doe',
      avatarUrl: ''
    }),
    borderColor: 'blue'
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
