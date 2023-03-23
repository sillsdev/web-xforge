import { Meta, Story } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { mock } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { ShareButtonComponent } from './share-button.component';

export default {
  title: 'Utility/ShareButton',
  component: ShareButtonComponent
} as Meta;

const Template: Story = args => ({
  moduleMetadata: {
    imports: [UICommonModule, BrowserAnimationsModule, CommonModule],
    providers: [
      { provide: ActivatedRoute, useValue: mock(ActivatedRoute) },
      { provide: DialogService, useValue: mock(DialogService) }
    ]
  },
  props: args
});

export const IconOnly = Template.bind({});

export const ButtonWithText = Template.bind({});
ButtonWithText.args = { iconOnlyButton: false };
