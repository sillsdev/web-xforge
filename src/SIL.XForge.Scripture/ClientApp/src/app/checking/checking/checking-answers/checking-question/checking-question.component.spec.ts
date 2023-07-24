import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { PwaService } from 'xforge-common/pwa.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { TextAudioDoc } from '../../../../core/models/text-audio-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { SingleButtonAudioPlayerComponent } from '../../single-button-audio-player/single-button-audio-player.component';
import { CheckingQuestionComponent } from './checking-question.component';

const mockedSFProjectService = mock(SFProjectService);
const mockedPwaService = mock(PwaService);
const mockedQuestionDoc = mock(QuestionDoc);
const mockedQuestion = mock<Question>();

@Component({
  template: `<app-checking-question #question [questionDoc]="questionDoc"></app-checking-question>`
})
class MockComponent {
  @ViewChild('question') question!: CheckingQuestionComponent;
  questionDoc: QuestionDoc = instance(mockedQuestionDoc);
  constructor() {
    when(mockedQuestion.projectRef).thenReturn('project01');
    when(mockedQuestion.text).thenReturn('some text');
    when(mockedQuestion.audioUrl).thenReturn('test-audio-player.webm');
    const verseRef = mock<VerseRefData>();
    when(verseRef.bookNum).thenReturn(8);
    when(verseRef.chapterNum).thenReturn(22);
    when(verseRef.verseNum).thenReturn(17);
    when(mockedQuestion.verseRef).thenReturn(instance(verseRef));
    when(mockedQuestionDoc.data).thenReturn(instance(mockedQuestion));
  }
}

describe('CheckingQuestionComponent', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule],
    declarations: [CheckingQuestionComponent, SingleButtonAudioPlayerComponent, MockComponent],
    providers: [
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: QuestionDoc, useMock: mockedQuestionDoc }
    ]
  }));

  it('selects scripture text when scripture audio is present', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    expect(env.component.question.focusedText).toBe('scripture-audio-label');
    expect(window.getComputedStyle(env.scriptureAudio.nativeElement)['display']).not.toBe('none');
    expect(window.getComputedStyle(env.questionAudio.nativeElement)['display']).toBe('none');
  });

  it('selects question when scripture audio absent', async () => {
    const env = new TestEnvironment();
    when(mockedSFProjectService.queryAudioText('project01')).thenResolve(instance(mock(RealtimeQuery<TextAudioDoc>)));
    await env.wait();
    await env.wait();

    expect(env.component.question.focusedText).toBe('question-audio-label');
    expect(env.scriptureAudio).toBeNull();
    expect(window.getComputedStyle(env.questionAudio.nativeElement)['display']).not.toBe('none');
  });

  it('hides audio player when question w/o audio is selected', async () => {
    const env = new TestEnvironment();
    when(mockedQuestion.audioUrl).thenReturn('');
    await env.wait();
    await env.wait();

    env.component.question.selectQuestion();
    await env.wait();

    expect(env.component.question.focusedText).toBe('question-audio-label');
    expect(window.getComputedStyle(env.scriptureAudio.nativeElement)['display']).toBe('none');
    expect(env.questionAudio).toBeNull();
  });

  it('selects question the first time scripture audio plays', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    env.scriptureAudio.componentInstance.audio.setSeek(98);
    await env.wait();
    env.component.question.playScripture();

    await env.wait(1000); //wait for the audio to finish playing
    expect(env.component.question.focusedText).toBe('question-audio-label');

    env.component.question.selectScripture();
    env.scriptureAudio.componentInstance.audio.setSeek(98);
    await env.wait();
    env.component.question.playScripture();

    await env.wait(1000); //wait for the audio to finish playing
    expect(env.component.question.focusedText).toBe('scripture-audio-label');
  });

  it('does not select question if scriptureAudio is set to the same value', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    const originalComponent = env.scriptureAudio.componentInstance;

    //play through the scripture audio once
    env.scriptureAudio.componentInstance.audio.setSeek(98);
    await env.wait();
    env.component.question.playScripture();
    await env.wait(1000); //wait for the audio to finish playing
    expect(env.component.question.focusedText).toBe('question-audio-label');

    env.component.question.selectScripture();
    await env.wait();
    expect(env.component.question.focusedText).toBe('scripture-audio-label');

    //ViewChild setters are called even when the current and previous values are the same.
    //Prevent duplicate set's from messing with the user's selection
    env.component.question.scriptureAudio = originalComponent;
    await env.wait();

    expect(env.component.question.focusedText).toBe('scripture-audio-label');
  });

  it('reloads audio files when switching to a new questionDoc', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    //new question
    const newQuestionDoc = mock(QuestionDoc);
    const newQuestion = mock<Question>();
    when(newQuestion.projectRef).thenReturn('project01');
    when(newQuestion.text).thenReturn('another question');
    when(newQuestion.audioUrl).thenReturn('test-audio-player-b.webm');
    const verseRef = mock<VerseRefData>();
    when(verseRef.bookNum).thenReturn(1);
    when(verseRef.chapterNum).thenReturn(11);
    when(verseRef.verseNum).thenReturn(111);
    when(newQuestion.verseRef).thenReturn(instance(verseRef));
    when(newQuestionDoc.data).thenReturn(instance(newQuestion));

    //new scripture audio
    const query = mock(RealtimeQuery<TextAudioDoc>) as RealtimeQuery<TextAudioDoc>;
    const audioDoc = mock(TextAudioDoc);
    const textAudio = mock<TextAudio>();
    when(textAudio.audioUrl).thenReturn('test-audio-player.webm');
    when(textAudio.timings).thenReturn([]);
    when(audioDoc.data).thenReturn(instance(textAudio));
    when(audioDoc.id).thenReturn(getTextAudioId('project01', 1, 11));
    when(query.docs).thenReturn([instance(audioDoc)]);
    when(mockedSFProjectService.queryAudioText('project01')).thenResolve(instance(query));

    await env.wait();

    expect(env.component.question.questionAudioUrl).toEqual('test-audio-player.webm');
    expect(env.component.question.scriptureAudioUrl).toEqual('test-audio-player-b.webm');

    env.component.questionDoc = instance(newQuestionDoc);
    await env.wait();

    expect(env.component.question.questionAudioUrl).toEqual('test-audio-player-b.webm');
    expect(env.component.question.scriptureAudioUrl).toEqual('test-audio-player.webm');
  });

  it('has default question text', async () => {
    const env = new TestEnvironment();
    when(mockedQuestion.text).thenReturn('');
    await env.wait();
    await env.wait();

    expect(env.component.question.questionText).toContain('Listen to the question for');
  });
});

class TestEnvironment {
  readonly component: MockComponent;
  readonly fixture: ComponentFixture<MockComponent>;
  readonly ngZone: NgZone;

  constructor() {
    const query = mock(RealtimeQuery<TextAudioDoc>) as RealtimeQuery<TextAudioDoc>;
    const audioDoc = mock(TextAudioDoc);
    const textAudio = mock<TextAudio>();
    when(textAudio.audioUrl).thenReturn('test-audio-player-b.webm');
    when(textAudio.timings).thenReturn([]);
    when(audioDoc.data).thenReturn(instance(textAudio));
    when(audioDoc.id).thenReturn(getTextAudioId('project01', 8, 22));
    when(query.docs).thenReturn([instance(audioDoc)]);

    when(mockedPwaService.onlineStatus$).thenReturn(of(true));
    when(mockedSFProjectService.onlineIsSourceProject('project01')).thenResolve(false);
    when(mockedSFProjectService.onlineDelete(anything())).thenResolve();
    when(mockedSFProjectService.onlineUpdateSettings('project01', anything())).thenResolve();
    when(mockedSFProjectService.queryAudioText('project01')).thenResolve(instance(query));

    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(MockComponent);
    this.component = this.fixture.componentInstance;
  }

  get scriptureAudio(): DebugElement {
    return this.fixture.debugElement.query(By.css('#scriptureAudio'));
  }

  get questionAudio(): DebugElement {
    return this.fixture.debugElement.query(By.css('#questionAudio'));
  }

  async wait(ms: number = 100): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
