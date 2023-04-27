import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { FontSizeComponent } from './font-size.component';

const meta: Meta<FontSizeComponent> = {
  title: 'Utility/FontSizeComponent',
  component: FontSizeComponent,
  decorators: [moduleMetadata({ imports: [CommonModule, UICommonModule] })]
};

export default meta;

type Story = StoryObj<FontSizeComponent>;

export const Default: Story = {};
