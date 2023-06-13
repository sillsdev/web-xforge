import { CommonModule } from '@angular/common';
import { AngularRenderer, componentWrapperDecorator, Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect } from '@storybook/jest';
import { userEvent } from '@storybook/testing-library';
import { PlayFunction, PlayFunctionContext } from '@storybook/types';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { FontSizeComponent } from './font-size.component';

export default {
  title: 'Utility/Font Size Adjuster',
  component: FontSizeComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule]
    }),
    componentWrapperDecorator(
      story => `
      <div style="display:flex; justify-content:flex-end; padding:0 0 60px; margin:10px 20px">
      ${story}
      </div>
    `
    )
  ],
  args: {
    min: 1,
    max: 3
  }
} as Meta<FontSizeComponent>;

type Story = StoryObj<FontSizeComponent>;

export const Inactive: Story = {};

export const OpenMenu: Story = {
  play: () => {
    const menuTrigger: HTMLElement | null = document.body.querySelector('.font-size-menu-trigger');

    expect(menuTrigger).not.toBeNull();
    userEvent.click(menuTrigger!);
  }
};

export const OpenMenuWithEndSpace: Story = {
  ...OpenMenu,
  decorators: [
    componentWrapperDecorator(
      story => `
      ${story}
      <div style="width:40px; height:40px; border:2px dotted #ccc;"></div>
    `
    )
  ]
};

export const IncreaseFontAllowed: Story = {
  args: { fontSize: 2 },
  play: playForAdjustFontButton('Increase')
};

export const IncreaseFontNotAllowed: Story = {
  ...IncreaseFontAllowed,
  args: { fontSize: 3 }
};

export const DecreaseFontAllowed: Story = {
  args: { fontSize: 2 },
  play: playForAdjustFontButton('Decrease')
};

export const DecreaseFontNotAllowed: Story = {
  ...DecreaseFontAllowed,
  args: { fontSize: 1 }
};

/**
 * Return 'play' function to open menu and click the specified button.
 */
function playForAdjustFontButton(which: 'Increase' | 'Decrease'): PlayFunction<AngularRenderer, FontSizeComponent> {
  return (context: PlayFunctionContext<AngularRenderer, FontSizeComponent>) => {
    OpenMenu.play?.(context);

    const adjustFontButton: HTMLElement | null = document.body.querySelector(
      `.font-size-menu  button[title="${which} font size"]`
    );

    expect(adjustFontButton).not.toBeNull();
    userEvent.click(adjustFontButton!, undefined, { skipPointerEventsCheck: true });
  };
}
