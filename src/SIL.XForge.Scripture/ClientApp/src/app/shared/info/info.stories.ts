import { CommonModule } from '@angular/common';
import { Meta, StoryFn } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { InfoComponent } from './info.component';

const defaultArgs = {
  text: 'Some useful information.'
};

const meta: Meta<InfoComponent> = {
  title: 'Utility/Info',
  component: InfoComponent,
  args: defaultArgs
};
export default meta;

const Template: StoryFn = args => ({
  moduleMetadata: { imports: [UICommonModule, CommonModule] },
  props: args
});

export const Info = Template.bind({});
