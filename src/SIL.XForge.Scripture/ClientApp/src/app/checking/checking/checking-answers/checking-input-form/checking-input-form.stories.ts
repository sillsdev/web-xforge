import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from '@storybook/test';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AttachAudioComponent } from '../../../attach-audio/attach-audio.component';
import { TextAndAudioComponent } from '../../../text-and-audio/text-and-audio.component';
import { CheckingAudioRecorderComponent } from '../../checking-audio-recorder/checking-audio-recorder.component';
import { CheckingInputFormComponent } from './checking-input-form.component';

const meta: Meta<CheckingInputFormComponent> = {
  title: 'Checking/Comments/Comment Form',
  component: CheckingInputFormComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule],
      declarations: [TextAndAudioComponent, AttachAudioComponent, CheckingAudioRecorderComponent]
    })
  ]
};
export default meta;

type Story = StoryObj<CheckingInputFormComponent>;

export const NewForm: Story = {
  parameters: {
    // Disabled due to inconsistent rendering of Material outlined form field (the outline sometimes comes closer to the
    // label than at other times)
    chromatic: { disableSnapshot: true }
  }
};

export const EditForm: Story = {
  args: {
    answer: {
      dataId: 'c01',
      ownerRef: 'user01',
      text: 'This is a comment',
      deleted: false,
      dateCreated: '',
      dateModified: ''
    } as Answer
  },
  parameters: {
    // Disabled for the same reason the story above
    chromatic: { disableSnapshot: true }
  }
};

export const InvalidForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Only necessary because the autofocus directive has to use setTimeout
    await new Promise(resolve => setTimeout(resolve, 0));
    const saveButton: HTMLElement = canvas.getByRole('button', {
      name: /Save/i
    });
    await userEvent.click(saveButton);
    const error: HTMLElement = canvas.getByText(/Provide text or audio before saving/i);
    expect(error).toBeInTheDocument();
  }
};
