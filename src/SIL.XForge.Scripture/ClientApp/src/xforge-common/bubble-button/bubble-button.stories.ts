import '!style-loader!css-loader!sass-loader!./bubble-button.scss';
import { MatButtonModule } from '@angular/material/button';
import { componentWrapperDecorator, Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { BubbleButtonDirective } from './bubble-button.directive';

export default {
  title: 'Misc/Bubble Button',

  decorators: [
    moduleMetadata({
      imports: [MatButtonModule],
      declarations: [BubbleButtonDirective]
    }),
    componentWrapperDecorator(
      story => `
      <div style="display:flex; justify-content:center; padding:100px 0">
        ${story}
      </div>
      `
    )
  ],
  parameters: {
    chromatic: { disableSnapshot: true }
  }
} as Meta;

type Story = StoryObj;

export const MatRaisedButton: Story = {
  render: () => ({ template: `<button mat-raised-button sfBubbleButton color="primary">Mat raised button</button>` })
};

export const MatFlatButton: Story = {
  render: () => ({ template: `<button mat-flat-button sfBubbleButton color="primary">Mat flat button</button>` })
};

export const MatStrokedButton: Story = {
  render: () => ({ template: `<button mat-stroked-button sfBubbleButton color="primary">Mat stroked button</button>` })
};

export const MatButton: Story = {
  render: () => ({ template: `<button mat-button sfBubbleButton color="primary">Mat button</button>` })
};

export const VanillaButton: Story = {
  render: () => ({ template: `<button sfBubbleButton color="primary">Vanilla button</button>` })
};

export const LongTextButton: Story = {
  render: () => ({
    template: `<button mat-flat-button sfBubbleButton color="primary">This mat flat button has long text</button>`
  })
};

export const ShortTextButton: Story = {
  render: () => ({ template: `<button mat-flat-button sfBubbleButton color="primary">Ok</button>` })
};
