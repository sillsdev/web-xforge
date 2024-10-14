import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect } from '@storybook/test';
import { cloneDeep } from 'mingo/util';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { anything, instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../../../core/models/sf-type-registry';
import { TextAudioDoc } from '../../../../core/models/text-audio-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { SingleButtonAudioPlayerComponent } from '../../single-button-audio-player/single-button-audio-player.component';
import { CheckingQuestionComponent } from './checking-question.component';

const mockedProjectService = mock(SFProjectService);
const query: RealtimeQuery<TextAudioDoc> = mock(RealtimeQuery<TextAudioDoc>);
const projectUserConfigDoc: SFProjectUserConfigDoc = mock(SFProjectUserConfigDoc);
const projectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
  projectRef: 'project01',
  ownerRef: 'user01',
  translationSuggestionsEnabled: false
});
const textAudioDoc: TextAudioDoc = mock(TextAudioDoc);
const textAudio: TextAudio = {
  dataId: 'id123',
  projectRef: 'project01',
  timings: [],
  audioUrl: './test-audio-player.webm',
  ownerRef: 'user01',
  mimeType: 'audio/webm'
};
when(textAudioDoc.id).thenReturn(getTextAudioId('project01', 1, 1));
when(textAudioDoc.data).thenReturn(textAudio);
when(projectUserConfigDoc.id).thenReturn(getSFProjectUserConfigDocId('project01', 'user01'));
when(projectUserConfigDoc.data).thenReturn(projectUserConfig);
when(query.docs).thenReturn([instance(textAudioDoc)]);
when(mockedProjectService.queryAudioText(anything())).thenResolve(instance(query));
const questionDoc: QuestionDoc = mock(QuestionDoc);
const question: Question = {
  dataId: 'question01',
  projectRef: 'project01',
  text: 'question text',
  verseRef: { bookNum: 1, chapterNum: 1, verseNum: 1 },
  answers: [],
  ownerRef: 'user01',
  dateCreated: '',
  dateModified: '',
  isArchived: false
};
when(questionDoc.data).thenReturn(question);
const questionWithAudio: Question = cloneDeep(question) as Question;
questionWithAudio.audioUrl = './test-audio-player.webm';
const questionDocAudio: QuestionDoc = mock(QuestionDoc);
when(questionDocAudio.data).thenReturn(questionWithAudio);

const meta: Meta<CheckingQuestionComponent> = {
  title: 'Checking/Answers/Question',
  component: CheckingQuestionComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
      providers: [{ provide: SFProjectService, useValue: instance(mockedProjectService) }],
      declarations: [SingleButtonAudioPlayerComponent]
    })
  ],
  args: { questionDoc: instance(questionDoc) }
};

export default meta;
type Story = StoryObj<CheckingQuestionComponent>;

export const Default: Story = {
  play: async () => {
    const selector: string = '.question-text.question-audio-label';
    let questionFocused: HTMLElement | null = document.body.querySelector(selector);
    // the question text is not focused
    expect(questionFocused).toBeNull();
    const questionText: HTMLElement = document.body.querySelector('.question-text > p')!;
    questionText.click();
    questionFocused = document.body.querySelector(selector);
    // the question text is now focused
    expect(questionFocused).not.toBeNull();
  }
};

export const WithQuestionAudio: Story = {
  args: { questionDoc: instance(questionDocAudio) }
};
