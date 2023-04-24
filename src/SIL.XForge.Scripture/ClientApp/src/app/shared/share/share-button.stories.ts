import { Meta, StoryFn } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { instance, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { of } from 'rxjs';
import { ShareButtonComponent } from './share-button.component';

const mockedActivatedRoute = mock(ActivatedRoute);
when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project1' }));
const mockedDialogService = mock(DialogService);

export default {
  title: 'Utility/ShareButton',
  component: ShareButtonComponent
} as Meta;

const Template: StoryFn = args => ({
  moduleMetadata: {
    imports: [UICommonModule, CommonModule, I18nStoryModule],
    providers: [
      { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
      { provide: DialogService, useValue: instance(mockedDialogService) }
    ]
  },
  props: args
});

export const IconOnly = Template.bind({});

export const ButtonWithText = Template.bind({});
ButtonWithText.args = { iconOnlyButton: false };
