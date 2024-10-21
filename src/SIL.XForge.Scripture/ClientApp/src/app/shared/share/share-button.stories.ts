import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/test';
import { of } from 'rxjs';
import { anything, instance, mock, reset, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ShareButtonComponent } from './share-button.component';

const mockedActivatedRoute = mock(ActivatedRoute);
when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project1' }));
const mockedDialogService = mock(DialogService);

const meta: Meta<ShareButtonComponent> = {
  title: 'Utility/ShareButton',
  component: ShareButtonComponent
};
export default meta;

type Story = StoryObj<ShareButtonComponent>;

const Template: Story = {
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      providers: [
        { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
        { provide: DialogService, useValue: instance(mockedDialogService) }
      ]
    })
  ],
  play: async ({ canvasElement }) => {
    reset(mockedDialogService);
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');
    await userEvent.click(button);
    verify(mockedDialogService.openMatDialog(anything(), anything())).once();
  }
};

export const ButtonWithIcon: Story = {
  ...Template,
  parameters: {
    // Disabled because the tooltip keeps causing the snapshot to be different by a few pixels
    chromatic: { disableSnapshot: true }
  }
};

export const ButtonWithText: Story = {
  ...Template,
  args: { iconOnlyButton: false }
};
